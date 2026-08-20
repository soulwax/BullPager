import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  archiveAllCardsInLane: vi.fn(),
  createCardAttachment: vi.fn(),
  createProjectCard: vi.fn(),
  createProjectComment: vi.fn(),
  createProjectTag: vi.fn(),
  deleteCardAttachment: vi.fn(),
  deleteProjectCard: vi.fn(),
  deleteProjectComment: vi.fn(),
  deleteProjectTag: vi.fn(),
  getBoardProject: vi.fn(),
  listCardAttachments: vi.fn(),
  listProjectActivity: vi.fn(),
  listProjectCards: vi.fn(),
  listProjectComments: vi.fn(),
  listProjectTags: vi.fn(),
  listStarredProjectSlugs: vi.fn(),
  loadBoardSettings: vi.fn(),
  loadProjectViewState: vi.fn(),
  moveAllCardsInLane: vi.fn(),
  recordProjectActivity: vi.fn(),
  renameProjectLanes: vi.fn(),
  reorderProjectCard: vi.fn(),
  saveBoardSettings: vi.fn(),
  saveProjectViewState: vi.fn(),
  setProjectCardOrder: vi.fn(),
  setProjectCardWatching: vi.fn(),
  setProjectStar: vi.fn(),
  syncUnityPlannerCards: vi.fn(),
  updateProjectCard: vi.fn(),
  updateProjectName: vi.fn()
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
    persistence.listProjectTags.mockResolvedValue([]);
    persistence.createProjectCard.mockResolvedValue(undefined);
    persistence.createProjectComment.mockResolvedValue(undefined);
    persistence.deleteProjectComment.mockResolvedValue(undefined);
    persistence.setProjectCardWatching.mockResolvedValue(undefined);
    persistence.updateProjectCard.mockResolvedValue(undefined);
    persistence.reorderProjectCard.mockResolvedValue(undefined);
    persistence.setProjectCardOrder.mockResolvedValue(undefined);
    persistence.recordProjectActivity.mockResolvedValue(undefined);
    persistence.saveBoardSettings.mockResolvedValue(undefined);
    persistence.renameProjectLanes.mockResolvedValue(undefined);
    persistence.moveAllCardsInLane.mockResolvedValue(0);
    persistence.archiveAllCardsInLane.mockResolvedValue(0);
    persistence.updateProjectName.mockResolvedValue(undefined);
    persistence.setProjectStar.mockResolvedValue(undefined);
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

  it('accepts one of the card\'s own attachment URLs as an image cover', async () => {
    const result = await actions.createCard(context({ title: 'Cover me', lane: 'Ready', coverColor: '/projects/demo/files/raw?path=attachments%2Fcard-1%2Fbanner.png' }, 'editor'));
    expect(result).toEqual({ message: 'Card saved.' });
    expect(persistence.createProjectCard).toHaveBeenCalledWith(expect.objectContaining({ coverColor: '/projects/demo/files/raw?path=attachments%2Fcard-1%2Fbanner.png' }));
  });

  it('rejects a cover pointed at another project or an arbitrary URL', async () => {
    const other = await actions.createCard(context({ title: 'Nope', lane: 'Ready', coverColor: '/projects/someone-elses-board/files/raw?path=x.png' }, 'editor'));
    expect(other).toMatchObject({ status: 400 });
    const external = await actions.createCard(context({ title: 'Nope', lane: 'Ready', coverColor: 'https://evil.example/x.png' }, 'editor'));
    expect(external).toMatchObject({ status: 400 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
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
    expect(persistence.reorderProjectCard).toHaveBeenCalledWith('demo', 'card-1', 'Done');
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
    expect(persistence.saveProjectViewState).toHaveBeenCalledWith('demo', 'ada', { density: 'compact', labelText: false, collapsed: { Ready: true, Done: false }, query: '', priority: 'all', tag: 'all', assignee: 'all', showArchived: false });
  });

  it('persists the label-text preference', async () => {
    const result = await actions.saveView({
      request: request({ labelText: 'true' }),
      locals: { role: 'viewer', username: 'ada' },
      params: { slug: 'demo' }
    } as never);
    expect(result).toEqual({ message: 'View saved.' });
    expect(persistence.saveProjectViewState).toHaveBeenCalledWith('demo', 'ada', expect.objectContaining({ labelText: true }));
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

  it('assigns and unassigns a card without touching its other fields', async () => {
    persistence.listProjectCards.mockResolvedValue([{ id: 'card-1', projectSlug: 'demo', title: 'Keep as-is', details: 'unchanged', lane: 'Ready', owner: '', priority: 'high', dueDate: '2026-09-01', archived: false, checklist: [{ id: 'c1', text: 'step', done: true }], coverColor: '#5E9CFF', tags: [{ id: 'demo-tag-design', projectSlug: 'demo', name: 'Design', color: '#F08FC0', createdAt: '' }], position: 0, createdAt: '', updatedAt: '' }]);
    const assigned = await actions.assignCard(context({ id: 'card-1', owner: 'ada' }, 'editor', 'ada'));
    expect(assigned).toEqual({ message: 'Card assigned.' });
    expect(persistence.updateProjectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1', owner: 'ada', title: 'Keep as-is', details: 'unchanged', priority: 'high', coverColor: '#5E9CFF', checklist: [{ id: 'c1', text: 'step', done: true }], tagIds: ['demo-tag-design'] }));
  });

  it('rejects assigning a card on a source-owned board', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]', 'project_demo_source': 'plan' });
    const result = await actions.assignCard(context({ id: 'unity-ward-21', owner: 'ada' }, 'editor', 'ada'));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.updateProjectCard).not.toHaveBeenCalled();
  });
});

describe('source-owned lock (Unity plan mirror)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]', 'project_demo_source': 'plan' });
    persistence.listProjectTags.mockResolvedValue([]);
    persistence.updateProjectCard.mockResolvedValue(undefined);
    persistence.recordProjectActivity.mockResolvedValue(undefined);
    persistence.reorderProjectCard.mockResolvedValue(undefined);
  });

  it('rejects creating a new card on a source-owned board', async () => {
    const result = await actions.createCard(context({ title: 'Ad hoc', lane: 'Ready' }, 'editor'));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
  });

  it('rejects duplicating and deleting a card on a source-owned board', async () => {
    const duplicated = await actions.duplicateCard({ request: request({ id: 'unity-ward-21' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(duplicated).toMatchObject({ status: 403 });
    const deleted = await actions.deleteCard({ request: request({ id: 'unity-ward-21' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(deleted).toMatchObject({ status: 403 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
    expect(persistence.deleteProjectCard).not.toHaveBeenCalled();
  });

  it('keeps title/details/owner/priority/cover from the source but takes the submitted checklist ticks, lane, and due date', async () => {
    persistence.listProjectCards.mockResolvedValue([{
      id: 'unity-ward-21', projectSlug: 'demo', title: 'WARD-21 · Implement movement', details: 'Synced from the plan.', lane: 'Backlog', owner: 'unassigned', priority: 'high', coverColor: '#5E9CFF', dueDate: null, dueComplete: false, startDate: null, archived: false, position: 0, createdAt: '', updatedAt: '',
      checklist: [{ id: 'ward-21-handle-1', text: 'u2-move-capsule-rule', done: false }, { id: 'ward-21-handle-2', text: 'u2-move-stairs-rule', done: false }],
      tags: []
    }]);
    const result = await actions.updateCard({
      request: requestEntries([
        ['id', 'unity-ward-21'], ['title', 'A forged title'], ['details', 'forged details'], ['lane', 'Ready'], ['owner', 'sneaky'], ['priority', 'low'], ['coverColor', '#F17878'], ['dueDate', '2026-09-01'],
        ['checkItemId', 'ward-21-handle-1'], ['checkItemText', 'renamed handle text'], ['checkItemDone', 'ward-21-handle-1'],
        ['checkItemId', 'ward-21-handle-2'], ['checkItemText', 'u2-move-stairs-rule']
      ]),
      locals: { role: 'editor', username: 'ada' },
      params: { slug: 'demo' }
    } as never);
    expect(result).toEqual({ message: 'Card updated.' });
    expect(persistence.updateProjectCard).toHaveBeenCalledWith(expect.objectContaining({
      title: 'WARD-21 · Implement movement',
      details: 'Synced from the plan.',
      owner: 'unassigned',
      priority: 'high',
      coverColor: '#5E9CFF',
      lane: 'Ready',
      dueDate: '2026-09-01',
      checklist: [
        { id: 'ward-21-handle-1', text: 'u2-move-capsule-rule', done: true },
        { id: 'ward-21-handle-2', text: 'u2-move-stairs-rule', done: false }
      ]
    }));
  });

  it('archiving, moving, and commenting stay allowed on a source-owned board', async () => {
    persistence.listProjectCards.mockResolvedValue([{ id: 'unity-ward-21', projectSlug: 'demo', title: 'WARD-21', details: '', lane: 'Ready', owner: 'unassigned', priority: 'high', dueDate: null, archived: false, checklist: [], tags: [], position: 0, createdAt: '', updatedAt: '' }]);
    const archived = await actions.archiveCard(context({ id: 'unity-ward-21', archived: 'true' }, 'editor'));
    expect(archived).toEqual({ message: 'Card archived.' });
    const moved = await actions.moveCard(context({ id: 'unity-ward-21', lane: 'Done' }, 'editor'));
    expect(moved).toEqual({ message: 'Card moved.' });
  });
});

describe('WEB-T3 list and board actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]' });
    persistence.listProjectCards.mockResolvedValue([]);
    persistence.listProjectTags.mockResolvedValue([]);
    persistence.saveBoardSettings.mockResolvedValue(undefined);
    persistence.renameProjectLanes.mockResolvedValue(undefined);
    persistence.moveAllCardsInLane.mockResolvedValue(0);
    persistence.archiveAllCardsInLane.mockResolvedValue(0);
    persistence.recordProjectActivity.mockResolvedValue(undefined);
    persistence.updateProjectName.mockResolvedValue(undefined);
    persistence.setProjectStar.mockResolvedValue(undefined);
  });

  it('renames the board for editors and blocks viewers', async () => {
    const renamed = await actions.renameBoard(context({ name: 'Renamed board' }, 'editor'));
    expect(renamed).toEqual({ message: 'Board renamed.' });
    expect(persistence.updateProjectName).toHaveBeenCalledWith('demo', 'Renamed board');
    const blocked = await actions.renameBoard(context({ name: 'Nope' }, 'viewer'));
    expect(blocked).toMatchObject({ status: 403 });
  });

  it('lets a signed-in user star and unstar a board', async () => {
    const result = await actions.toggleStar({ request: request({ starred: 'true' }), locals: { role: 'viewer', username: 'sam' }, params: { slug: 'demo' } } as never);
    expect(result).toEqual({ message: 'Board starred.' });
    expect(persistence.setProjectStar).toHaveBeenCalledWith('sam', 'demo', true);
    const anon = await actions.toggleStar({ request: request({ starred: 'true' }), locals: { role: '', username: '' }, params: { slug: 'demo' } } as never);
    expect(anon).toMatchObject({ status: 401 });
  });

  it('adds a list at a chosen position and rejects a duplicate name', async () => {
    const result = await actions.addLane(context({ name: 'Review', after: 'Backlog' }, 'editor'));
    expect(result).toEqual({ message: 'List added.' });
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith({ 'project_demo_lanes': JSON.stringify(['Backlog', 'Review', 'Ready', 'Done']) });
    const dup = await actions.addLane(context({ name: 'Ready', after: 'Backlog' }, 'editor'));
    expect(dup).toMatchObject({ status: 409 });
  });

  it('renames a list, updating both the card rows and the lane order', async () => {
    const result = await actions.renameLane(context({ from: 'Ready', to: 'In review' }, 'editor'));
    expect(result).toEqual({ message: 'List renamed.' });
    expect(persistence.renameProjectLanes).toHaveBeenCalledWith('demo', [{ from: 'Ready', to: 'In review' }]);
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith({ 'project_demo_lanes': JSON.stringify(['Backlog', 'In review', 'Done']) });
  });

  it('rejects renaming a list to a name that already exists', async () => {
    const result = await actions.renameLane(context({ from: 'Ready', to: 'Done' }, 'editor'));
    expect(result).toMatchObject({ status: 409 });
    expect(persistence.renameProjectLanes).not.toHaveBeenCalled();
  });

  it('moves every card from one list to another', async () => {
    persistence.moveAllCardsInLane.mockResolvedValue(3);
    const result = await actions.moveAllInLane(context({ fromLane: 'Backlog', toLane: 'Ready' }, 'editor'));
    expect(result).toEqual({ message: 'Cards moved.' });
    expect(persistence.moveAllCardsInLane).toHaveBeenCalledWith('demo', 'Backlog', 'Ready');
    expect(persistence.recordProjectActivity).toHaveBeenCalledWith(expect.objectContaining({ summary: expect.stringContaining('3 cards') }));
  });

  it('archives every card in a list', async () => {
    persistence.archiveAllCardsInLane.mockResolvedValue(2);
    const result = await actions.archiveAllInLane(context({ lane: 'Done' }, 'editor'));
    expect(result).toEqual({ message: 'List archived.' });
    expect(persistence.archiveAllCardsInLane).toHaveBeenCalledWith('demo', 'Done', true);
  });

  it('copies a list with its cards', async () => {
    persistence.listProjectCards.mockResolvedValue([
      { id: 'card-1', projectSlug: 'demo', title: 'Keep moving', details: 'd', lane: 'Backlog', owner: 'ada', priority: 'normal', dueDate: null, startDate: null, archived: false, checklist: [{ id: 'c1', text: 'step', done: true }], tags: [], coverColor: '', position: 0, createdAt: '', updatedAt: '' },
      { id: 'card-2', projectSlug: 'demo', title: 'Archived, skipped', details: '', lane: 'Backlog', owner: 'ada', priority: 'normal', dueDate: null, startDate: null, archived: true, checklist: [], tags: [], coverColor: '', position: 1, createdAt: '', updatedAt: '' }
    ]);
    const result = await actions.copyLane(context({ sourceLane: 'Backlog', name: 'Backlog copy' }, 'editor'));
    expect(result).toEqual({ message: 'List copied.' });
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith({ 'project_demo_lanes': JSON.stringify(['Backlog', 'Backlog copy', 'Ready', 'Done']) });
    expect(persistence.createProjectCard).toHaveBeenCalledTimes(1);
    expect(persistence.createProjectCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Keep moving', lane: 'Backlog copy', checklist: [expect.objectContaining({ text: 'step', done: false })] }));
  });

  it('rejects copying a list on a source-owned board', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]', 'project_demo_source': 'plan' });
    const result = await actions.copyLane(context({ sourceLane: 'Backlog', name: 'Backlog copy' }, 'editor'));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
  });

  it('sets and clears a work-in-progress limit', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]', 'project_demo_wip_limits': JSON.stringify({ Backlog: 5 }) });
    const set = await actions.setWipLimit(context({ lane: 'Ready', limit: '3' }, 'editor'));
    expect(set).toEqual({ message: 'Limit set.' });
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith({ 'project_demo_wip_limits': JSON.stringify({ Backlog: 5, Ready: 3 }) });
    const cleared = await actions.setWipLimit(context({ lane: 'Backlog', limit: '' }, 'editor'));
    expect(cleared).toEqual({ message: 'Limit cleared.' });
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith({ 'project_demo_wip_limits': JSON.stringify({}) });
  });

  it('rejects a non-numeric work-in-progress limit', async () => {
    const result = await actions.setWipLimit(context({ lane: 'Ready', limit: '0' }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
  });
});

describe('card templates', () => {
  const sourceCard = { id: 'card-1', projectSlug: 'demo', title: 'Report a bug', details: 'Steps to reproduce', lane: 'Backlog', owner: 'ada', priority: 'high', dueDate: null, startDate: null, archived: false, checklist: [{ id: 'c1', text: 'Repro steps', done: true }], tags: [{ id: 'tag-1', name: 'bug', color: '#F17878' }], coverColor: '#F17878', position: 0, createdAt: '', updatedAt: '' };

  beforeEach(() => {
    vi.clearAllMocks();
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]' });
    persistence.listProjectCards.mockResolvedValue([sourceCard]);
    persistence.listProjectTags.mockResolvedValue([]);
    persistence.saveBoardSettings.mockResolvedValue(undefined);
    persistence.createProjectCard.mockResolvedValue(undefined);
    persistence.recordProjectActivity.mockResolvedValue(undefined);
  });

  it('saves a card as a template scoped to its list', async () => {
    const result = await actions.saveCardAsTemplate(context({ cardId: 'card-1', name: 'Bug report' }, 'editor'));
    expect(result).toEqual({ message: 'Template saved.' });
    const saved = JSON.parse(persistence.saveBoardSettings.mock.calls[0][0]['project_demo_templates']);
    expect(saved.Backlog).toEqual([expect.objectContaining({ name: 'Bug report', title: 'Report a bug', details: 'Steps to reproduce', priority: 'high', coverColor: '#F17878', checklist: [{ id: 'c1', text: 'Repro steps' }], tagIds: ['tag-1'] })]);
  });

  it('rejects saving a template without a name', async () => {
    const result = await actions.saveCardAsTemplate(context({ cardId: 'card-1', name: '  ' }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
  });

  it('rejects a list past its ten-template cap', async () => {
    const full = Array.from({ length: 10 }, (_, index) => ({ id: `template-${index}`, name: `T${index}`, title: 't', details: '', priority: 'normal', coverColor: '', checklist: [], tagIds: [] }));
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]', 'project_demo_templates': JSON.stringify({ Backlog: full }) });
    const result = await actions.saveCardAsTemplate(context({ cardId: 'card-1', name: 'One too many' }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
  });

  it('deletes a template by id and leaves the rest of the list untouched', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]', 'project_demo_templates': JSON.stringify({ Backlog: [{ id: 'template-1', name: 'Keep', title: '', details: '', priority: 'normal', coverColor: '', checklist: [], tagIds: [] }, { id: 'template-2', name: 'Remove', title: '', details: '', priority: 'normal', coverColor: '', checklist: [], tagIds: [] }] }) });
    const result = await actions.deleteTemplate(context({ lane: 'Backlog', templateId: 'template-2' }, 'editor'));
    expect(result).toEqual({ message: 'Template removed.' });
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith({ 'project_demo_templates': JSON.stringify({ Backlog: [{ id: 'template-1', name: 'Keep', title: '', details: '', priority: 'normal', coverColor: '', checklist: [], tagIds: [] }] }) });
  });

  it('rejects deleting a template that does not exist', async () => {
    const result = await actions.deleteTemplate(context({ lane: 'Backlog', templateId: 'missing' }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
  });

  it('creates a new card from a template with a reset checklist and no owner', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]', 'project_demo_templates': JSON.stringify({ Backlog: [{ id: 'template-1', name: 'Bug report', title: 'Report a bug', details: 'Steps', priority: 'high', coverColor: '#F17878', checklist: [{ id: 'c1', text: 'Repro steps' }], tagIds: ['tag-1'] }] }) });
    const result = await actions.createCardFromTemplate(context({ lane: 'Backlog', templateId: 'template-1' }, 'editor'));
    expect(result).toEqual({ message: 'Card created from template.' });
    expect(persistence.createProjectCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Report a bug', lane: 'Backlog', owner: '', priority: 'high', coverColor: '#F17878', tagIds: ['tag-1'], checklist: [expect.objectContaining({ text: 'Repro steps', done: false })] }));
    expect(persistence.recordProjectActivity).toHaveBeenCalledWith(expect.objectContaining({ summary: expect.stringContaining('Bug report') }));
  });

  it('rejects creating from a template on a source-owned board', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Ready","Done"]', 'project_demo_source': 'plan', 'project_demo_templates': JSON.stringify({ Backlog: [{ id: 'template-1', name: 'Bug report', title: 't', details: '', priority: 'normal', coverColor: '', checklist: [], tagIds: [] }] }) });
    const result = await actions.createCardFromTemplate(context({ lane: 'Backlog', templateId: 'template-1' }, 'editor'));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
  });

  it('rejects creating from an unknown template', async () => {
    const result = await actions.createCardFromTemplate(context({ lane: 'Backlog', templateId: 'missing' }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.createProjectCard).not.toHaveBeenCalled();
  });
});

describe('image cover cleanup on attachment removal', () => {
  const coveredCard = { id: 'card-1', projectSlug: 'demo', title: 'Has a cover', details: '', lane: 'Backlog', owner: 'ada', priority: 'normal', dueDate: null, startDate: null, archived: false, checklist: [], tags: [], coverColor: '/projects/demo/files/raw?path=banner.png', position: 0, createdAt: '', updatedAt: '' };
  const attachment = { id: 'attach-1', projectSlug: 'demo', cardId: 'card-1', name: 'banner.png', url: '/projects/demo/files/raw?path=banner.png', mimeType: 'image/png', size: 1024, createdBy: 'ada', createdAt: '' };

  beforeEach(() => {
    vi.clearAllMocks();
    persistence.listProjectCards.mockResolvedValue([coveredCard]);
    persistence.listCardAttachments.mockResolvedValue([attachment]);
    persistence.updateProjectCard.mockResolvedValue(undefined);
    persistence.deleteCardAttachment.mockResolvedValue(undefined);
    persistence.recordProjectActivity.mockResolvedValue(undefined);
  });

  it('clears the card cover when its source attachment is deleted', async () => {
    const result = await actions.deleteAttachment(context({ id: 'attach-1', cardId: 'card-1' }, 'editor'));
    expect(result).toEqual({ message: 'Attachment removed.' });
    expect(persistence.updateProjectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1', coverColor: '' }));
    expect(persistence.deleteCardAttachment).toHaveBeenCalledWith('demo', 'attach-1');
  });

  it('leaves the cover untouched when deleting an unrelated attachment', async () => {
    persistence.listCardAttachments.mockResolvedValue([attachment, { ...attachment, id: 'attach-2', name: 'other.png', url: '/projects/demo/files/raw?path=other.png' }]);
    const result = await actions.deleteAttachment(context({ id: 'attach-2', cardId: 'card-1' }, 'editor'));
    expect(result).toEqual({ message: 'Attachment removed.' });
    expect(persistence.updateProjectCard).not.toHaveBeenCalled();
    expect(persistence.deleteCardAttachment).toHaveBeenCalledWith('demo', 'attach-2');
  });
});

describe('saveAppearance action (board-level theme, cards, density, background)', () => {
  const fullAppearance = { theme: 'forest', cardTheme: 'glass-dark', density: 'dense', radius: 'round', laneWidth: 'wide', textScale: 'large', shadow: 'lifted', glassIntensity: '62', accent: '#7bb61b', highContrast: 'true', cardAging: 'true' };

  beforeEach(() => {
    vi.clearAllMocks();
    persistence.saveBoardSettings.mockResolvedValue(undefined);
    persistence.getBoardProject.mockResolvedValue({ slug: 'demo', name: 'Demo', owner: 'ada', visibility: 'private' });
  });

  it('rejects a viewer without editor access', async () => {
    const result = await actions.saveAppearance(context({ ...fullAppearance, background: 'none' }, 'viewer'));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
  });

  it('normalizes and persists every appearance field under the project prefix', async () => {
    const result = await actions.saveAppearance(context({ ...fullAppearance, background: 'trello-green' }, 'editor'));
    expect(result).toEqual({ message: 'Appearance saved.' });
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith({
      'project_demo_theme': 'forest',
      'project_demo_card_theme': 'glass-dark',
      'project_demo_density': 'dense',
      'project_demo_radius': 'round',
      'project_demo_lane_width': 'wide',
      'project_demo_text_scale': 'large',
      'project_demo_shadow': 'lifted',
      'project_demo_glass_intensity': '62',
      'project_demo_accent': '#7bb61b',
      'project_demo_high_contrast': 'true',
      'project_demo_card_aging': 'true',
      'project_demo_background': 'trello-green'
    });
  });

  it('falls back to defaults for an unrecognized theme instead of failing outright', async () => {
    const result = await actions.saveAppearance(context({ ...fullAppearance, theme: 'not-a-real-theme', background: 'none' }, 'editor'));
    expect(result).toEqual({ message: 'Appearance saved.' });
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith(expect.objectContaining({ 'project_demo_theme': 'midnight' }));
  });

  it('accepts a custom background (the settings page owns the actual upload)', async () => {
    const result = await actions.saveAppearance(context({ ...fullAppearance, background: 'custom' }, 'editor'));
    expect(result).toEqual({ message: 'Appearance saved.' });
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith(expect.objectContaining({ 'project_demo_background': 'custom' }));
  });

  it('rejects a background id that does not exist', async () => {
    const result = await actions.saveAppearance(context({ ...fullAppearance, background: 'not-a-real-background' }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
  });
});

describe('board automation (Butler-style rules) wired into moveCard/reorderCard/updateCard', () => {
  const doneRule = { id: 'r1', name: 'Wrap up', enabled: true, trigger: { type: 'enters-lane', lane: 'Done' }, actions: [{ type: 'set-priority', priority: 'low' }, { type: 'mark-due-complete' }] };
  const card = { id: 'card-1', projectSlug: 'demo', title: 'Ship the thing', details: '', lane: 'Backlog', owner: 'ada', priority: 'urgent', dueDate: '2026-09-01', dueComplete: false, startDate: null, archived: false, checklist: [], tags: [], coverColor: '', position: 0, createdAt: '', updatedAt: '' };

  beforeEach(() => {
    vi.clearAllMocks();
    persistence.listProjectCards.mockResolvedValue([card]);
    persistence.listProjectTags.mockResolvedValue([]);
    persistence.updateProjectCard.mockResolvedValue(undefined);
    persistence.reorderProjectCard.mockResolvedValue(undefined);
    persistence.recordProjectActivity.mockResolvedValue(undefined);
  });

  it('runs a matching rule when moveCard lands the card in the trigger lane', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': JSON.stringify([doneRule]) });
    await actions.moveCard(context({ id: 'card-1', lane: 'Done' }, 'editor'));
    expect(persistence.updateProjectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1', priority: 'low', dueComplete: true }));
    expect(persistence.recordProjectActivity).toHaveBeenCalledWith(expect.objectContaining({ actor: 'Automation', summary: expect.stringContaining('Wrap up') }));
  });

  it('runs a matching rule when a cross-lane reorderCard drop lands in the trigger lane', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': JSON.stringify([doneRule]) });
    await actions.reorderCard(context({ id: 'card-1', lane: 'Done', beforeId: '' }, 'editor'));
    expect(persistence.updateProjectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1', priority: 'low', dueComplete: true }));
  });

  it('does not run a same-lane reorder (no lane actually entered)', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': JSON.stringify([doneRule]) });
    await actions.reorderCard(context({ id: 'card-1', lane: 'Backlog', beforeId: '' }, 'editor'));
    expect(persistence.updateProjectCard).not.toHaveBeenCalled();
  });

  it('runs a checklist-completed rule from updateCard only on the tick that finishes the list', async () => {
    const almostDone = { ...card, checklist: [{ id: 'c1', text: 'a', done: true }, { id: 'c2', text: 'b', done: false }] };
    persistence.listProjectCards.mockResolvedValue([almostDone]);
    persistence.loadBoardSettings.mockResolvedValue({
      'project_demo_lanes': '["Backlog","Doing","Done"]',
      'project_demo_automations': JSON.stringify([{ id: 'r2', name: 'Auto-archive', enabled: true, trigger: { type: 'checklist-completed' }, actions: [{ type: 'archive' }] }])
    });
    await actions.updateCard({
      request: requestEntries([
        ['id', 'card-1'], ['title', 'Ship the thing'], ['details', ''], ['lane', 'Backlog'], ['owner', 'ada'], ['priority', 'urgent'],
        ['checkItemId', 'c1'], ['checkItemText', 'a'], ['checkItemDone', 'c1'],
        ['checkItemId', 'c2'], ['checkItemText', 'b'], ['checkItemDone', 'c2']
      ]),
      locals: { role: 'editor', username: 'ada' },
      params: { slug: 'demo' }
    } as never);
    expect(persistence.updateProjectCard).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'card-1', archived: true }));
  });

  it('does nothing when no rule is configured for the board', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]' });
    await actions.moveCard(context({ id: 'card-1', lane: 'Done' }, 'editor'));
    expect(persistence.updateProjectCard).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a disabled rule', async () => {
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': JSON.stringify([{ ...doneRule, enabled: false }]) });
    await actions.moveCard(context({ id: 'card-1', lane: 'Done' }, 'editor'));
    expect(persistence.updateProjectCard).toHaveBeenCalledTimes(1);
  });
});
