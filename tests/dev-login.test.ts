import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The dev-login route is an authentication bypass, so its gates are asserted
 * rather than trusted: the `dev` build constant, a configured key of adequate
 * length, and a matching supplied key. Any one of them missing must produce a
 * 404 that is indistinguishable from a route that does not exist.
 */

const environment = vi.hoisted(() => ({ dev: true }));
const dynamicEnv = vi.hoisted(() => ({ env: {} as Record<string, string> }));
const auth = vi.hoisted(() => ({
  createSession: vi.fn(async () => 'signed.session.token'),
  sessionCookie: 'project_agile_session'
}));

vi.mock('$app/environment', () => environment);
vi.mock('$env/dynamic/private', () => dynamicEnv);
vi.mock('../src/lib/server/auth', () => auth);

const { GET } = await import('../src/routes/auth/dev/+server');

const GOOD_KEY = 'k'.repeat(32);

function context(search: string) {
  return { url: new URL(`http://127.0.0.1:5173/auth/dev${search}`), cookies: { set: vi.fn() } } as never;
}

/** SvelteKit throws its redirect/error objects rather than returning them. */
async function thrown(search: string) {
  try {
    await GET(context(search));
  } catch (value) {
    return value as { status?: number; location?: string };
  }
  throw new Error('expected the route to throw');
}

describe('dev login gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    environment.dev = true;
    dynamicEnv.env = { DEV_LOGIN_KEY: GOOD_KEY, APP_SESSION_SECRET: 'secret', APP_LOGIN: 'ada' };
  });

  it('404s in any build, which is every deployment', async () => {
    environment.dev = false;
    expect((await thrown(`?key=${GOOD_KEY}`)).status).toBe(404);
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it('404s when no key is configured, so it is off by default per machine', async () => {
    dynamicEnv.env = { APP_SESSION_SECRET: 'secret' };
    expect((await thrown(`?key=${GOOD_KEY}`)).status).toBe(404);
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it('404s when the configured key is too short to be worth attacking', async () => {
    dynamicEnv.env = { DEV_LOGIN_KEY: 'short', APP_SESSION_SECRET: 'secret' };
    expect((await thrown('?key=short')).status).toBe(404);
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it('404s on a missing or wrong key', async () => {
    expect((await thrown('')).status).toBe(404);
    expect((await thrown(`?key=${'x'.repeat(32)}`)).status).toBe(404);
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it('404s when no session secret exists to sign with', async () => {
    dynamicEnv.env = { DEV_LOGIN_KEY: GOOD_KEY };
    expect((await thrown(`?key=${GOOD_KEY}`)).status).toBe(404);
    expect(auth.createSession).not.toHaveBeenCalled();
  });
});

describe('dev login success path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    environment.dev = true;
    dynamicEnv.env = { DEV_LOGIN_KEY: GOOD_KEY, APP_SESSION_SECRET: 'secret', APP_LOGIN: 'ada' };
  });

  it('issues a superadmin session for APP_LOGIN and redirects home', async () => {
    const result = await thrown(`?key=${GOOD_KEY}`);
    expect(result.status).toBe(303);
    expect(result.location).toBe('/');
    expect(auth.createSession).toHaveBeenCalledWith('ada', 'superadmin');
  });

  it('honours an explicit username and role', async () => {
    await thrown(`?key=${GOOD_KEY}&as=grace&role=viewer`);
    expect(auth.createSession).toHaveBeenCalledWith('grace', 'viewer');
  });

  it('ignores a role that is not a real role', async () => {
    await thrown(`?key=${GOOD_KEY}&role=root`);
    expect(auth.createSession).toHaveBeenCalledWith('ada', 'superadmin');
  });

  it('follows a same-origin next path', async () => {
    expect((await thrown(`?key=${GOOD_KEY}&next=/projects/demo`)).location).toBe('/projects/demo');
  });

  it('refuses a protocol-relative next, which would be an open redirect', async () => {
    expect((await thrown(`?key=${GOOD_KEY}&next=//evil.test/pwn`)).location).toBe('/');
    expect((await thrown(`?key=${GOOD_KEY}&next=https://evil.test`)).location).toBe('/');
  });

  it('marks the cookie httpOnly and lax', async () => {
    const ctx = context(`?key=${GOOD_KEY}`);
    try { await GET(ctx); } catch { /* redirect */ }
    const [name, , options] = (ctx as unknown as { cookies: { set: { mock: { calls: unknown[][] } } } }).cookies.set.mock.calls[0];
    expect(name).toBe('project_agile_session');
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});
