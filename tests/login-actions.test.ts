import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  authConfigured: vi.fn(),
  authenticate: vi.fn(),
  createSession: vi.fn(),
  githubConfigured: vi.fn(),
  sessionCookie: 'project_agile_session'
}));

const persistence = vi.hoisted(() => ({
  clearLoginFailures: vi.fn(),
  LOGIN_ATTEMPT_LIMIT: 5,
  recentLoginFailures: vi.fn(),
  recordLoginFailure: vi.fn()
}));

vi.mock('../src/lib/server/auth', () => auth);
vi.mock('../src/lib/server/persistence', () => persistence);

const { actions } = await import('../src/routes/login/+page.server');

function context(login: string, password: string, address = '203.0.113.9') {
  const body = new URLSearchParams({ login, password });
  const cookies = { set: vi.fn() };
  return { request: new Request('https://example.test/login', { method: 'POST', body }), cookies, url: new URL('https://example.test/login'), getClientAddress: () => address } as never;
}

describe('login rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.authConfigured.mockReturnValue(true);
    persistence.recentLoginFailures.mockResolvedValue(0);
  });

  it('authenticates and clears failures on a correct password', async () => {
    auth.authenticate.mockResolvedValue('editor');
    auth.createSession.mockReturnValue('token');
    await expect(actions.default(context('ada', 'correct-password'))).rejects.toMatchObject({ status: 303, location: '/' });
    expect(persistence.clearLoginFailures).toHaveBeenCalledWith('203.0.113.9:ada');
    expect(persistence.recordLoginFailure).not.toHaveBeenCalled();
  });

  it('records a failure and rejects on a wrong password, without locking out yet', async () => {
    auth.authenticate.mockResolvedValue(null);
    const result = await actions.default(context('ada', 'wrong-password'));
    expect(result).toMatchObject({ status: 401 });
    expect(persistence.recordLoginFailure).toHaveBeenCalledWith('203.0.113.9:ada');
    expect(persistence.clearLoginFailures).not.toHaveBeenCalled();
  });

  it('blocks further attempts once the window is at its limit, without touching authenticate', async () => {
    persistence.recentLoginFailures.mockResolvedValue(5);
    const result = await actions.default(context('ada', 'anything'));
    expect(result).toMatchObject({ status: 429 });
    expect(auth.authenticate).not.toHaveBeenCalled();
  });

  it('keys the limit by address and username together, not username alone', async () => {
    persistence.recentLoginFailures.mockResolvedValue(0);
    auth.authenticate.mockResolvedValue(null);
    await actions.default(context('ada', 'wrong-password', '198.51.100.4'));
    expect(persistence.recentLoginFailures).toHaveBeenCalledWith('198.51.100.4:ada');
    expect(persistence.recordLoginFailure).toHaveBeenCalledWith('198.51.100.4:ada');
  });

  it('refuses to run when authentication is not configured, before checking attempts', async () => {
    auth.authConfigured.mockReturnValue(false);
    const result = await actions.default(context('ada', 'x'));
    expect(result).toMatchObject({ status: 503 });
    expect(persistence.recentLoginFailures).not.toHaveBeenCalled();
  });
});
