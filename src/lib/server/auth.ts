import { env } from '$env/dynamic/private';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { authenticateGithubUser, authenticateUser, loadBoardSettings } from '$lib/server/persistence';
import type { UserRole } from '$lib/types';

export const sessionCookie = 'project_agile_session';
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function digest(value: string): Buffer {
  return createHmac('sha256', 'project-agile-credential-check').update(value).digest();
}

function sameSecret(left: string, right: string): boolean {
  const a = digest(left);
  const b = digest(right);
  return timingSafeEqual(a, b);
}

export function authConfigured(): boolean {
  return Boolean(env.APP_LOGIN && env.APP_PASSWORD && env.APP_SESSION_SECRET);
}

export function githubConfigured() { return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET); }
export const githubStateCookie = 'project_agile_github_state';
export function githubState() { return randomBytes(24).toString('base64url'); }
export function githubAuthorizeUrl(state: string, origin: string) {
  const redirectUri = env.GITHUB_OAUTH_REDIRECT || `${origin}/auth/github/callback`;
  const params = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID || '', redirect_uri: redirectUri, scope: 'read:user user:email', state });
  return `https://github.com/login/oauth/authorize?${params}`;
}
export async function authenticateGithub(githubId: string, login: string): Promise<UserRole> {
  if (login.toLowerCase() === 'soulwax') return 'superadmin';
  const settings = await loadBoardSettings();
  return authenticateGithubUser(githubId, login, settings.github_default_role === 'editor' ? 'editor' : 'viewer');
}

export function validCredentials(login: string, password: string): boolean {
  return authConfigured() && sameSecret(login, env.APP_LOGIN) && sameSecret(password, env.APP_PASSWORD);
}

export type Session = { username: string; role: UserRole; expires: number };

export async function authenticate(login: string, password: string): Promise<UserRole | null> {
  if (validCredentials(login, password)) return 'superadmin';
  return authenticateUser(login, password);
}

export function createSession(username: string, role: UserRole): string {
  const expires = Date.now() + sessionLifetimeMs;
  const payload = Buffer.from(JSON.stringify({ username, role, expires })).toString('base64url');
  const signature = createHmac('sha256', env.APP_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function sessionFromCookie(value: string | undefined): Session | null {
  if (!value || !env.APP_SESSION_SECRET) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', env.APP_SESSION_SECRET).update(payload).digest('base64url');
  if (!sameSecret(signature, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    return session.expires >= Date.now() ? session : null;
  } catch { return null; }
}

export function validSession(value: string | undefined): boolean { return Boolean(sessionFromCookie(value)); }
