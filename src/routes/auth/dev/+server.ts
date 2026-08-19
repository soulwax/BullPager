import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createSession, sessionCookie } from '$lib/server/auth';
import type { UserRole } from '$lib/types';

/**
 * Development-only instant login, for driving the real app in a headless
 * browser to check appearance changes against live data.
 *
 * This is an authentication bypass, so it is written to fail closed on every
 * axis:
 *
 * 1. `dev` is a build-time constant that is only true under `vite dev`. Any
 *    built artifact — `vite build`, `vite preview`, the Vercel deployment —
 *    has it inlined as `false`, so this route cannot authenticate anyone in
 *    production even if the key were somehow known.
 * 2. It additionally requires `DEV_LOGIN_KEY` in the environment. Absent (or
 *    too short to be worth attacking) means the route stays off even locally,
 *    so it is opt-in per machine rather than on by default.
 * 3. Every rejection returns 404 rather than 401/403, so the endpoint is
 *    indistinguishable from a route that does not exist. The key never
 *    reaches a log line.
 *
 * Usage: /auth/dev?key=$DEV_LOGIN_KEY[&as=<username>][&role=<role>][&next=/path]
 */

/** Long enough that brute force is pointless; `openssl rand -hex 24` fits. */
const MIN_KEY_LENGTH = 24;

const ROLES: readonly UserRole[] = ['viewer', 'editor', 'admin', 'superadmin'];

function sameKey(supplied: string, configured: string): boolean {
  // HMAC both sides first so timingSafeEqual gets equal-length buffers and
  // the comparison leaks neither the key's length nor its content.
  const a = createHmac('sha256', 'dev-login-key-check').update(supplied).digest();
  const b = createHmac('sha256', 'dev-login-key-check').update(configured).digest();
  return timingSafeEqual(a, b);
}

export async function GET({ url, cookies }) {
  if (!dev) throw error(404, 'Not found');

  const configured = env.DEV_LOGIN_KEY ?? '';
  if (configured.length < MIN_KEY_LENGTH) throw error(404, 'Not found');

  const supplied = url.searchParams.get('key') ?? '';
  if (!supplied || !sameKey(supplied, configured)) throw error(404, 'Not found');

  if (!env.APP_SESSION_SECRET) throw error(404, 'Not found');

  const username = (url.searchParams.get('as') || env.APP_LOGIN || 'dev').slice(0, 120);
  const requestedRole = url.searchParams.get('role');
  const role: UserRole = ROLES.includes(requestedRole as UserRole) ? (requestedRole as UserRole) : 'superadmin';

  cookies.set(sessionCookie, await createSession(username, role), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: 7 * 24 * 60 * 60
  });

  // Same open-redirect guard the real login uses: only same-origin paths.
  const next = url.searchParams.get('next');
  throw redirect(303, next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
}
