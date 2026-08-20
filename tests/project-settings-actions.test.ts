import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  getBoardProject: vi.fn(),
  loadBoardSettings: vi.fn(),
  renameProjectLanes: vi.fn(),
  saveBoardSettings: vi.fn()
}));

vi.mock('../src/lib/server/persistence', () => persistence);

const { actions } = await import('../src/routes/projects/[slug]/settings/+page.server');

function context(values: Record<string, string[] | string>, role: string, username = 'ada') {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) body.append(key, entry);
  }
  return { request: new Request('https://example.test/projects/demo/settings', { method: 'POST', body }), locals: { role, username }, params: { slug: 'demo' } } as never;
}

const baseFields = { workflowKey: 'K-1', cadence: 'weekly', visibility: 'private', laneStyle: 'scroll', laneName: ['Backlog', 'Doing', 'Done'], laneOriginal: ['Backlog', 'Doing', 'Done'] };

describe('project settings saveSettings action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.getBoardProject.mockResolvedValue({ slug: 'demo', name: 'Demo', owner: 'ada', visibility: 'private' });
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]' });
    persistence.renameProjectLanes.mockResolvedValue(undefined);
    persistence.saveBoardSettings.mockResolvedValue(undefined);
  });

  it('rejects a viewer without editor access', async () => {
    const result = await actions.saveSettings(context(baseFields, 'viewer'));
    expect(result).toMatchObject({ status: 403 });
    expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
  });

  it('saves workflow, cadence, visibility, lane style, and lanes — and nothing about appearance or background', async () => {
    const result = await actions.saveSettings(context(baseFields, 'editor'));
    expect(result).toEqual({ message: 'Project settings saved.' });
    expect(persistence.saveBoardSettings).toHaveBeenCalledWith({
      'project_demo_workflow_key': 'K-1',
      'project_demo_cadence': 'weekly',
      'project_demo_visibility': 'private',
      'project_demo_show_outcomes': 'false',
      'project_demo_lane_style': 'scroll',
      'project_demo_lanes': JSON.stringify(['Backlog', 'Doing', 'Done'])
    });
  });

  it('leaves background and appearance settings untouched — those are the board panel\'s job now', async () => {
    await actions.saveSettings(context(baseFields, 'editor'));
    const saved = persistence.saveBoardSettings.mock.calls[0][0];
    expect(saved).not.toHaveProperty('project_demo_background');
    expect(saved).not.toHaveProperty('project_demo_theme');
    expect(saved).not.toHaveProperty('project_demo_card_theme');
    expect(saved).not.toHaveProperty('project_demo_high_contrast');
    expect(saved).not.toHaveProperty('project_demo_card_aging');
  });

  it('passes every current lane through as a rename pair, from what it was to what the form now says', async () => {
    await actions.saveSettings(context({ ...baseFields, laneName: ['Backlog', 'In progress', 'Done'] }, 'editor'));
    expect(persistence.renameProjectLanes).toHaveBeenCalledWith('demo', [
      { from: 'Backlog', to: 'Backlog' },
      { from: 'Doing', to: 'In progress' },
      { from: 'Done', to: 'Done' }
    ]);
  });

  it('rejects an invalid cadence', async () => {
    const result = await actions.saveSettings(context({ ...baseFields, cadence: 'daily' }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
    expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
  });

  it('rejects fewer than two lanes', async () => {
    const result = await actions.saveSettings(context({ ...baseFields, laneName: ['Solo'], laneOriginal: ['Solo'] }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
  });

  it('rejects duplicate lane names', async () => {
    const result = await actions.saveSettings(context({ ...baseFields, laneName: ['Backlog', 'Backlog', 'Done'] }, 'editor'));
    expect(result).toMatchObject({ status: 400 });
  });
});
