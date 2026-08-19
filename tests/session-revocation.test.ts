import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  authenticateGithubUser: vi.fn(),
  isSessionRevoked: vi.fn(),
  loadBoardSettings: vi.fn(),
  recordSession: vi.fn(),
  revokeSession: vi.fn()
}));

vi.mock('../src/lib/server/persistence', () => persistence);
vi.mock('$env/dynamic/private', () => ({ env: { APP_LOGIN: 'owner', APP_PASSWORD: 'super-secret', APP_SESSION_SECRET: 'test-signing-secret' } }));

const { createSession, endSession, sessionFromCookie } = await import('../src/lib/server/auth');

describe('session revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.isSessionRevoked.mockResolvedValue(false);
    persistence.recordSession.mockResolvedValue(undefined);
    persistence.revokeSession.mockResolvedValue(undefined);
  });

  it('records a new session row and returns a token that resolves back to it', async () => {
    const token = await createSession('ada', 'editor');
    expect(persistence.recordSession).toHaveBeenCalledWith(expect.any(String), 'ada');
    const session = await sessionFromCookie(token);
    expect(session).toMatchObject({ username: 'ada', role: 'editor' });
    expect(persistence.isSessionRevoked).toHaveBeenCalledWith(session?.sessionId);
  });

  it('rejects a token whose session has been revoked, even though the signature and expiry are still valid', async () => {
    const token = await createSession('ada', 'editor');
    persistence.isSessionRevoked.mockResolvedValue(true);
    const session = await sessionFromCookie(token);
    expect(session).toBeNull();
  });

  it('rejects a tampered token before ever checking revocation', async () => {
    const token = await createSession('ada', 'editor');
    const [payload] = token.split('.');
    const tampered = `${payload}.not-the-real-signature`;
    const session = await sessionFromCookie(tampered);
    expect(session).toBeNull();
    expect(persistence.isSessionRevoked).not.toHaveBeenCalled();
  });

  it('skips the revocation check entirely for a pre-migration token with no sessionId', async () => {
    const payload = Buffer.from(JSON.stringify({ username: 'ada', role: 'editor', expires: Date.now() + 60000 })).toString('base64url');
    const { createHmac } = await import('node:crypto');
    const signature = createHmac('sha256', 'test-signing-secret').update(payload).digest('base64url');
    const session = await sessionFromCookie(`${payload}.${signature}`);
    expect(session).toMatchObject({ username: 'ada', role: 'editor' });
    expect(persistence.isSessionRevoked).not.toHaveBeenCalled();
  });

  it('revokes the session a token points to on logout', async () => {
    const token = await createSession('ada', 'editor');
    await endSession(token);
    expect(persistence.revokeSession).toHaveBeenCalledTimes(1);
    const [revokedId] = persistence.revokeSession.mock.calls[0];
    expect(typeof revokedId).toBe('string');
    expect(revokedId.length).toBeGreaterThan(0);
  });

  it('does nothing on logout when there is no valid session to revoke', async () => {
    await endSession(undefined);
    await endSession('garbage.token');
    expect(persistence.revokeSession).not.toHaveBeenCalled();
  });
});
