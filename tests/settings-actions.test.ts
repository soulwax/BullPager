import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  createBoardUser: vi.fn(),
  deleteBoardUser: vi.fn(),
  listBoardProjects: vi.fn(),
  listBoardUsers: vi.fn(),
  loadBoardSettings: vi.fn(),
  saveBoardSettings: vi.fn(),
  updateBoardUserRole: vi.fn()
}));

vi.mock('../src/lib/server/persistence', () => persistence);
vi.mock('$env/dynamic/private', () => ({ env: { APP_LOGIN: 'owner' } }));

const { actions } = await import('../src/routes/settings/+page.server');

function context(values: Record<string, string>, role: 'superadmin' | 'admin' = 'admin') {
  const body = new URLSearchParams(values);
  return { request: new Request('https://example.test/settings', { method: 'POST', body }), locals: { role, username: role === 'superadmin' ? 'owner' : 'ada' } } as never;
}

describe('settings role hierarchy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.listBoardUsers.mockResolvedValue([
      { username: 'ada', role: 'admin', createdAt: '' },
      { username: 'editor', role: 'editor', createdAt: '' }
    ]);
  });

  it('allows the superadmin to create an admin', async () => {
    const result = await actions.createUser(context({ username: 'new-admin', password: 'long-enough', role: 'admin' }, 'superadmin'));
    expect(result).toEqual({ message: 'new-admin created as admin.' });
    expect(persistence.createBoardUser).toHaveBeenCalledWith('new-admin', 'long-enough', 'admin');
  });

  it('prevents an admin from creating an admin', async () => {
    const result = await actions.createUser(context({ username: 'new-admin', password: 'long-enough', role: 'admin' }));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.createBoardUser).not.toHaveBeenCalled();
  });

  it('prevents an admin from changing or removing another admin', async () => {
    const update = await actions.updateRole(context({ username: 'ada', role: 'viewer' }));
    const remove = await actions.deleteUser(context({ username: 'ada' }));
    expect(update).toMatchObject({ status: 403 });
    expect(remove).toMatchObject({ status: 403 });
    expect(persistence.updateBoardUserRole).not.toHaveBeenCalled();
    expect(persistence.deleteBoardUser).not.toHaveBeenCalled();
  });

  it('allows an admin to manage an editor account', async () => {
    const result = await actions.updateRole(context({ username: 'editor', role: 'viewer' }));
    expect(result).toEqual({ message: 'editor is now viewer.' });
    expect(persistence.updateBoardUserRole).toHaveBeenCalledWith('editor', 'viewer');
  });

  it('never accepts a superadmin role through the user form', async () => {
    const result = await actions.updateRole(context({ username: 'editor', role: 'superadmin' }, 'superadmin'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.updateBoardUserRole).not.toHaveBeenCalled();
  });
});
