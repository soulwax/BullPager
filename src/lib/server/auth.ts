import { env } from '$env/dynamic/private';
import { createHmac, timingSafeEqual } from 'node:crypto';

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

export function validCredentials(login: string, password: string): boolean {
  return authConfigured() && sameSecret(login, env.APP_LOGIN) && sameSecret(password, env.APP_PASSWORD);
}

export function createSession(): string {
  const expires = Date.now() + sessionLifetimeMs;
  const payload = String(expires);
  const signature = createHmac('sha256', env.APP_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function validSession(value: string | undefined): boolean {
  if (!value || !env.APP_SESSION_SECRET) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !signature || Number(payload) < Date.now()) return false;
  const expected = createHmac('sha256', env.APP_SESSION_SECRET).update(payload).digest('base64url');
  return sameSecret(signature, expected);
}
