import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  createProjectCard: vi.fn(),
  createProjectComment: vi.fn(),
  createProjectTag: vi.fn(),
  deleteProjectCard: vi.fn(),
  deleteProjectComment: vi.fn(),
  deleteProjectTag: vi.fn(),
  getBoardProject: vi.fn(),
  listProjectActivity: vi.fn(),
  listProjectCards: vi.fn(),
  listProjectComments: vi.fn(),
  loadBoardSettings: vi.fn(),
  loadProjectViewState: vi.fn(),
  recordProjectActivity: vi.fn(),
  reorderProjectCard: vi.fn(),
  saveProjectViewState: vi.fn(),
  setProjectCardOrder: vi.fn(),
  setProjectCardWatching: vi.fn(),
  updateProjectCard: vi.fn()
}));

vi.mock('../src/lib/server/persistence', () => persistence);

const { actions } = await import('../src/routes/projects/[slug]/+page.server');

function request(values: Record<string, string>) {
  return new Request('https://example.test/projects/demo', { method: 'POST', body: new URLSearchParams(values) });
}

function requestEntries(entries: [string, string][]) {
  const body = new URLSearchParams();
  for (const [key, value] of entries) body.append(key, value);
  return new Request('https://example.test/projects/demo', { method: 'POST', body });
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
    persistence.createProjectComment.mockResolvedValue(undefined);
    persistence.deleteProjectComment.mockResolvedValue(undefined);
    persistence.setProjectCardWatching.mockResolvedValue(undefined);
    persistence.updateProjectCard.mockResolvedValue(undefined);
    persistence.reorderProjectCard.mockResolvedValue(undefined);
    persistence.setProjectCardOrder.mockResolvedValue(undefined);
    persistence.recordProjectActivity.mockResolvedValue(undefined);
  });

  it('blocks viewers before touching persistence', async () => {
    const result = await actions.createCard(context({ title: 'Private work', lane: 'Ready' }, 'viewer'));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
  });

  it('persists a valid card and records activity', async () => {
    const result = await actions.createCard(context({ title: 'Prepare brief', details: 'Write the first draft.', lane: 'Ready', owner: 'ada', priority: 'high', dueDate: '2026-08-20', coverColor: '#5E9CFF' }, 'editor'));
    expect(result).toEqual({ message: 'Card saved.' });
    expect(persistence.createProjectCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Prepare brief', lane: 'Ready', priority: 'high', dueDate: '2026-08-20', owner: 'ada', coverColor: '#5E9CFF' }));
    expect(persistence.recordProjectActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'created', summary: expect.stringContaining('Prepare brief') }));
  });

  it('returns a retryable response when persistence is unavailable', async () => {
    persistence.createProjectCard.mockRejectedValueOnce(new Error('neon timeout'));
    const result = await actions.createCard(context({ title: 'Retry me', lane: 'Ready' }, 'editor'));
    expect(result).toMatchObject({ status: 503, data: { error: expect.stringContaining('temporarily unavailable') } });
    expect(persistence.recordProjectActivity).not.toHaveBeenCalled();
  });

  it('rejects invalid due dates without writing', async () => {
    const result = await actions.createCard(context({ title: 'Bad date', lane: 'Ready', dueDate: '2026-02-30' }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
  });

  it('moves an existing card through the persistent action', async () => {
    persistence.listProjectCards.mockResolvedValue([{ id: 'card-1', projectSlug: 'demo', title: 'Prepare brief', details: '', lane: 'Ready', owner: 'ada', priority: 'normal', dueDate: null, createdAt: '', updatedAt: '' }]);
    const result = await actions.moveCard(context({ id: 'card-1', lane: 'Done' }, 'editor'));
    expect(result).toEqual({ message: 'Card moved.' });
    expect(persistence.updateProjectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1', lane: 'Done' }));
    expect(persistence.recordProjectActivity).toHaveBeenCalledWith(expect.objectContaining({ summary: expect.stringContaining('Done') }));
  });

  it('persists a card reorder through the kanban action', async () => {
    const result = await actions.reorderCard(context({ id: 'card-1', lane: 'Done', beforeId: 'card-2' }, 'editor'));
    expect(result).toEqual({ message: 'Card order saved.' });
    expect(persistence.reorderProjectCard).toHaveBeenCalledWith('demo', 'card-1', 'Done', 'card-2');
  });

  it('persists an entire optimistic order snapshot atomically', async () => {
    persistence.listProjectCards.mockResolvedValue([
      { id: 'card-1', projectSlug: 'demo', title: 'One', details: '', lane: 'Ready', position: 0, owner: 'ada', priority: 'normal', dueDate: null, archived: false, checklist: [], tags: [], coverColor: '', createdAt: '', updatedAt: '' },
      { id: 'card-2', projectSlug: 'demo', title: 'Two', details: '', lane: 'Done', position: 0, owner: 'ada', priority: 'normal', dueDate: null, archived: false, checklist: [], tags: [], coverColor: '', createdAt: '', updatedAt: '' }
    ]);
    const result = await actions.saveOrder({ request: request({ order: JSON.stringify([{ id: 'card-2', lane: 'Ready', position: 0 }, { id: 'card-1', lane: 'Ready', position: 1 }]) }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(result).toEqual({ message: 'Card order saved.' });
    expect(persistence.setProjectCardOrder).toHaveBeenCalledWith('demo', [{ id: 'card-2', lane: 'Ready', position: 0 }, { id: 'card-1', lane: 'Ready', position: 1 }]);
  });

  it('saves only sanitized view preferences', async () => {
    const result = await actions.saveView({
      request: request({ density: 'compact', collapsed: JSON.stringify({ Ready: true, Done: false, invalid: 'yes' }) }),
      locals: { role: 'viewer', username: 'ada' },
      params: { slug: 'demo' }
    } as never);
    expect(result).toEqual({ message: 'View saved.' });
    expect(persistence.saveProjectViewState).toHaveBeenCalledWith('demo', 'ada', { density: 'compact', collapsed: { Ready: true, Done: false }, query: '', priority: 'all', tag: 'all', assignee: 'all', showArchived: false });
  });

  it('creates a tag for editors and rejects viewers', async () => {
    persistence.createProjectTag.mockResolvedValue({ id: 'demo-tag-design', projectSlug: 'demo', name: 'Design', color: '#F08FC0', createdAt: '' });
    const created = await actions.createTag(context({ name: 'Design', color: '#F08FC0' }, 'editor'));
    expect(created).toEqual({ message: 'Tag created.' });
    expect(persistence.createProjectTag).toHaveBeenCalledWith('demo', 'Design', '#F08FC0');
    const blocked = await actions.createTag(context({ name: 'Nope', color: '#F08FC0' }, 'viewer'));
    expect(blocked).toMatchObject({ status: 403 });
  });

  it('archives a card without deleting it', async () => {
    persistence.listProjectCards.mockResolvedValue([{ id: 'card-1', projectSlug: 'demo', title: 'Old card', details: '', lane: 'Done', owner: 'ada', priority: 'normal', dueDate: null, archived: false, tags: [], position: 0, createdAt: '', updatedAt: '' }]);
    const result = await actions.archiveCard(context({ id: 'card-1', archived: 'true' }, 'editor'));
    expect(result).toEqual({ message: 'Card archived.' });
    expect(persistence.updateProjectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1', archived: true }));
  });

  it('persists checklist text and checked state with a confirmed card edit', async () => {
    persistence.listProjectCards.mockResolvedValue([{ id: 'card-1', projectSlug: 'demo', title: 'Ship board', details: '', lane: 'Ready', owner: 'ada', priority: 'normal', dueDate: null, archived: false, checklist: [{ id: 'old', text: 'Review copy', done: false }], tags: [], position: 0, createdAt: '', updatedAt: '' }]);
    const result = await actions.updateCard({
      request: requestEntries([
        ['id', 'card-1'], ['title', 'Ship board'], ['details', ''], ['lane', 'Ready'], ['owner', 'ada'], ['priority', 'normal'],
        ['checkItemId', 'old'], ['checkItemText', 'Review copy'], ['checkItemDone', 'old'],
        ['checkItemId', 'new'], ['checkItemText', 'Capture release note']
      ]),
      locals: { role: 'editor', username: 'ada' },
      params: { slug: 'demo' }
    } as never);
    expect(result).toEqual({ message: 'Card updated.' });
    expect(persistence.updateProjectCard).toHaveBeenCalledWith(expect.objectContaining({ checklist: [
      { id: 'old', text: 'Review copy', done: true },
      expect.objectContaining({ text: 'Capture release note', done: false })
    ] }));
  });

  it('lets editors add a durable comment and blocks viewers', async () => {
    persistence.listProjectCards.mockResolvedValue([{ id: 'card-1', projectSlug: 'demo', title: 'Ship board', details: '', lane: 'Ready', owner: 'ada', priority: 'normal', dueDate: null, archived: false, checklist: [], tags: [], position: 0, createdAt: '', updatedAt: '' }]);
    const created = await actions.createComment({ request: request({ cardId: 'card-1', body: 'Decision: ship this in the next cut.' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(created).toEqual({ message: 'Comment saved.' });
    expect(persistence.createProjectComment).toHaveBeenCalledWith('demo', 'card-1', 'ada', 'Decision: ship this in the next cut.');
    const blocked = await actions.createComment({ request: request({ cardId: 'card-1', body: 'Nope' }), locals: { role: 'viewer', username: 'sam' }, params: { slug: 'demo' } } as never);
    expect(blocked).toMatchObject({ status: 403 });
  });

  it('allows comment authors to remove their own comment', async () => {
    const result = await actions.deleteComment({ request: request({ id: '42' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(result).toEqual({ message: 'Comment removed.' });
    expect(persistence.deleteProjectComment).toHaveBeenCalledWith('demo', '42', 'ada', false);
  });

  it('lets signed-in viewers watch and unwatch a card', async () => {
    persistence.listProjectCards.mockResolvedValue([{ id: 'card-1', projectSlug: 'demo', title: 'Observe', details: '', lane: 'Ready', owner: 'ada', priority: 'normal', dueDate: null, archived: false, checklist: [], coverColor: '', tags: [], position: 0, createdAt: '', updatedAt: '' }]);
    const watched = await actions.toggleWatch({ request: request({ id: 'card-1', watching: 'true' }), locals: { role: 'viewer', username: 'sam' }, params: { slug: 'demo' } } as never);
    expect(watched).toEqual({ message: 'Card is now being watched.' });
    expect(persistence.setProjectCardWatching).toHaveBeenCalledWith('demo', 'card-1', 'sam', true);
  });
});
