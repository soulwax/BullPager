import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  endSession: vi.fn(),
  sessionCookie: 'project_agile_session'
}));

const persistence = vi.hoisted(() => ({
  persistenceEnabled: vi.fn(() => false),
  revokeAllSessionsForUser: vi.fn(),
  savePacketNote: vi.fn(),
  saveTransition: vi.fn(),
  syncUnityPlannerCards: vi.fn()
}));

vi.mock('../src/lib/server/auth', () => auth);
vi.mock('../src/lib/server/persistence', () => persistence);

const { actions } = await import('../src/routes/+page.server');

function cookieJar(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return { get: (name: string) => store[name], delete: vi.fn((name: string) => { delete store[name]; }), set: vi.fn() };
}

describe('root logout actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.endSession.mockResolvedValue(undefined);
    persistence.revokeAllSessionsForUser.mockResolvedValue(undefined);
  });

  it('revokes only the current session on a plain logout', async () => {
    const cookies = cookieJar({ project_agile_session: 'the-token' });
    const result = await actions.logout({ cookies } as never);
    expect(auth.endSession).toHaveBeenCalledWith('the-token');
    expect(cookies.delete).toHaveBeenCalledWith('project_agile_session', { path: '/' });
    expect(persistence.revokeAllSessionsForUser).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Signed out.' });
  });

  it('revokes every session for the account on logout-everywhere and redirects to login', async () => {
    const cookies = cookieJar({ project_agile_session: 'the-token' });
    await expect(actions.logoutEverywhere({ cookies, locals: { username: 'ada' } } as never)).rejects.toMatchObject({ status: 303, location: '/login' });
    expect(persistence.revokeAllSessionsForUser).toHaveBeenCalledWith('ada');
    expect(cookies.delete).toHaveBeenCalledWith('project_agile_session', { path: '/' });
  });

  it('refuses logout-everywhere for a signed-out request', async () => {
    const cookies = cookieJar();
    const result = await actions.logoutEverywhere({ cookies, locals: {} } as never);
    expect(result).toMatchObject({ status: 401 });
    expect(persistence.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });
});
