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
  updateGraphNode: vi.fn()
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
