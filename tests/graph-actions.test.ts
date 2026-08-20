import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  createGraphEdge: vi.fn(),
  createGraphNode: vi.fn(),
  deleteGraphEdge: vi.fn(),
  deleteGraphNode: vi.fn(),
  getBoardProject: vi.fn(),
  listProjectCards: vi.fn(),
  loadProjectGraph: vi.fn(),
  saveGraphSettings: vi.fn(),
  updateGraphNode: vi.fn(),
  upsertProjectFile: vi.fn()
}));

vi.mock('../src/lib/server/persistence', () => persistence);
const { actions } = await import('../src/routes/projects/[slug]/graph/+page.server');

function request(values: Record<string, string>) {
  return new Request('https://example.test/projects/demo/graph', { method: 'POST', body: new URLSearchParams(values) });
}

describe('graph actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.createGraphNode.mockResolvedValue(2);
    persistence.createGraphEdge.mockResolvedValue(3);
    persistence.updateGraphNode.mockResolvedValue(4);
    persistence.deleteGraphNode.mockResolvedValue(5);
    persistence.deleteGraphEdge.mockResolvedValue(6);
    persistence.saveGraphSettings.mockResolvedValue(7);
    persistence.listProjectCards.mockResolvedValue([]);
    persistence.loadProjectGraph.mockResolvedValue({ settings: { revision: 1, snap: true, gridSize: 8, background: 'midnight' }, nodes: [{ id: 'a' }], edges: [] });
    persistence.upsertProjectFile.mockResolvedValue(undefined);
  });

  it('blocks viewers from mutating graph objects', async () => {
    const result = await actions.createNode({ request: request({ kind: 'note', title: 'Nope' }), locals: { role: 'viewer', username: 'sam' }, params: { slug: 'demo' } } as never);
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.createGraphNode).not.toHaveBeenCalled();
  });

  it('creates a validated note for editors', async () => {
    const result = await actions.createNode({ request: request({ kind: 'note', title: 'Decision', body: 'Use the graph for dependencies.' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(result).toEqual({ message: 'Graph object created.' });
    expect(persistence.createGraphNode).toHaveBeenCalledWith(expect.objectContaining({ kind: 'note', title: 'Decision', body: 'Use the graph for dependencies.', createdBy: 'ada' }));
  });

  it('creates connections and persists node movement', async () => {
    const edge = await actions.createEdge({ request: request({ sourceNodeId: 'a', targetNodeId: 'b', kind: 'depends_on' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(edge).toEqual({ message: 'Connection created.' });
    const moved = await actions.moveNode({ request: request({ id: 'a', x: '240', y: '180' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(moved).toEqual({ message: 'Position saved.' });
    expect(persistence.updateGraphNode).toHaveBeenCalledWith('demo', 'a', { x: 240, y: 180 }, undefined);
  });
});

describe('graph cloud backup (writes a snapshot after every successful mutation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.createGraphNode.mockResolvedValue(undefined);
    persistence.createGraphEdge.mockResolvedValue(undefined);
    persistence.updateGraphNode.mockResolvedValue(undefined);
    persistence.deleteGraphNode.mockResolvedValue(undefined);
    persistence.deleteGraphEdge.mockResolvedValue(undefined);
    persistence.saveGraphSettings.mockResolvedValue(undefined);
    persistence.loadProjectGraph.mockResolvedValue({
      settings: { revision: 3, snap: true, gridSize: 8, background: 'midnight' },
      nodes: [{ id: 'a', title: 'Decision' }],
      edges: [{ id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' }]
    });
    persistence.upsertProjectFile.mockResolvedValue(undefined);
  });

  it('writes the snapshot to a fixed graph/graph-snapshot.json path, not a new file per save', async () => {
    await actions.createNode({ request: request({ kind: 'note', title: 'Decision' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(persistence.upsertProjectFile).toHaveBeenCalledWith(expect.objectContaining({ projectSlug: 'demo', path: 'graph/graph-snapshot.json', mimeType: 'application/json' }));
  });

  it('encodes the current nodes, edges, and settings from a fresh read, not stale request data', async () => {
    await actions.moveNode({ request: request({ id: 'a', x: '10', y: '20' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    const written = persistence.upsertProjectFile.mock.calls[0][0].content;
    const parsed = JSON.parse(written);
    expect(parsed).toMatchObject({
      format: 'bullpager-graph-v1',
      projectSlug: 'demo',
      settings: { revision: 3, gridSize: 8 },
      nodes: [{ id: 'a', title: 'Decision' }],
      edges: [{ id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' }]
    });
    expect(typeof parsed.exportedAt).toBe('string');
  });

  it('backs up after createEdge, deleteNode, deleteEdge, and saveSettings too', async () => {
    await actions.createEdge({ request: request({ sourceNodeId: 'a', targetNodeId: 'b', kind: 'blocks' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    await actions.deleteNode({ request: request({ id: 'a' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    await actions.deleteEdge({ request: request({ id: 'e1' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    await actions.saveSettings({ request: request({ background: 'ocean' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(persistence.upsertProjectFile).toHaveBeenCalledTimes(4);
  });

  it('does not back up when the mutation itself is rejected (validation) or unauthorized', async () => {
    await actions.createNode({ request: request({ kind: 'note', title: '' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    await actions.createNode({ request: request({ kind: 'note', title: 'Nope' }), locals: { role: 'viewer', username: 'sam' }, params: { slug: 'demo' } } as never);
    expect(persistence.upsertProjectFile).not.toHaveBeenCalled();
  });

  it('does not back up when the underlying mutation throws', async () => {
    persistence.createGraphNode.mockRejectedValue(new Error('boom'));
    await actions.createNode({ request: request({ kind: 'note', title: 'Decision' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(persistence.upsertProjectFile).not.toHaveBeenCalled();
  });

  it('a failed backup write does not turn a successful mutation into an error response', async () => {
    persistence.upsertProjectFile.mockRejectedValue(new Error('r2 unavailable'));
    const result = await actions.createNode({ request: request({ kind: 'note', title: 'Decision' }), locals: { role: 'editor', username: 'ada' }, params: { slug: 'demo' } } as never);
    expect(result).toEqual({ message: 'Graph object created.' });
  });
});
