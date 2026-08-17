import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  createProjectCard: vi.fn(),
  deleteProjectCard: vi.fn(),
  getBoardProject: vi.fn(),
  listProjectActivity: vi.fn(),
  listProjectCards: vi.fn(),
  loadBoardSettings: vi.fn(),
  loadProjectViewState: vi.fn(),
  recordProjectActivity: vi.fn(),
  saveProjectViewState: vi.fn(),
  updateProjectCard: vi.fn()
}));

vi.mock('../src/lib/server/persistence', () => persistence);

const { actions } = await import('../src/routes/projects/[slug]/+page.server');

function request(values: Record<string, string>) {
  return new Request('https://example.test/projects/demo', { method: 'POST', body: new URLSearchParams(values) });
}

function context(values: Record<string, string>, role: string, username = 'ada') {
  return { request: request(values), locals: { role, username }, params: { slug: 'demo' } } as never;
}

describe('project card actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]' });
    persistence.listProjectCards.mockResolvedValue([]);
    persistence.createProjectCard.mockResolvedValue(undefined);
    persistence.recordProjectActivity.mockResolvedValue(undefined);
  });

  it('blocks viewers before touching persistence', async () => {
    const result = await actions.createCard(context({ title: 'Private work', lane: 'Ready' }, 'viewer'));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
  });

  it('persists a valid card and records activity', async () => {
    const result = await actions.createCard(context({ title: 'Prepare brief', details: 'Write the first draft.', lane: 'Ready', owner: 'ada', priority: 'high', dueDate: '2026-08-20' }, 'editor'));
    expect(result).toEqual({ message: 'Card saved.' });
    expect(persistence.createProjectCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Prepare brief', lane: 'Ready', priority: 'high', dueDate: '2026-08-20', owner: 'ada' }));
    expect(persistence.recordProjectActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'created', summary: expect.stringContaining('Prepare brief') }));
  });

  it('rejects invalid due dates without writing', async () => {
    const result = await actions.createCard(context({ title: 'Bad date', lane: 'Ready', dueDate: '2026-02-30' }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
  });

  it('saves only sanitized view preferences', async () => {
    const result = await actions.saveView({
      request: request({ density: 'compact', collapsed: JSON.stringify({ Ready: true, Done: false, invalid: 'yes' }) }),
      locals: { role: 'viewer', username: 'ada' },
      params: { slug: 'demo' }
    } as never);
    expect(result).toEqual({ message: 'View saved.' });
    expect(persistence.saveProjectViewState).toHaveBeenCalledWith('demo', 'ada', { density: 'compact', collapsed: { Ready: true, Done: false } });
  });
});
