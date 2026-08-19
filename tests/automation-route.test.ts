import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  getBoardProject: vi.fn(),
  listProjectTags: vi.fn(),
  loadBoardSettings: vi.fn(),
  recordProjectActivity: vi.fn(),
  saveBoardSettings: vi.fn()
}));

vi.mock('../src/lib/server/persistence', () => persistence);

const { actions } = await import('../src/routes/projects/[slug]/automation/+page.server');

function context(values: Record<string, string>, role: string, username = 'ada') {
  return { request: new Request('https://example.test/projects/demo/automation', { method: 'POST', body: new URLSearchParams(values) }), locals: { role, username }, params: { slug: 'demo' } } as never;
}

const doneRuleJson = JSON.stringify([{ id: 'rule-1', name: 'Existing rule', enabled: true, trigger: { type: 'enters-lane', lane: 'Done' }, actions: [{ type: 'archive' }] }]);

describe('automation route actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]' });
    persistence.listProjectTags.mockResolvedValue([{ id: 'tag-1', name: 'Shipped' }]);
    persistence.saveBoardSettings.mockResolvedValue(undefined);
    persistence.recordProjectActivity.mockResolvedValue(undefined);
  });

  describe('saveRule', () => {
    it('rejects a viewer', async () => {
      const result = await actions.saveRule(context({ name: 'x', triggerType: 'checklist-completed', actionsJson: '[{"type":"archive"}]' }, 'viewer'));
      expect(result).toMatchObject({ status: 403 });
      expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
    });

    it('creates a new rule and persists the full rule list under the automations key', async () => {
      const result = await actions.saveRule(context(
        { name: 'Wrap up', triggerType: 'enters-lane', triggerLane: 'Done', actionsJson: JSON.stringify([{ type: 'set-priority', priority: 'low' }]) },
        'editor'
      ));
      expect(result).toEqual({ message: 'Automation rule saved.' });
      expect(persistence.saveBoardSettings).toHaveBeenCalledWith({
        'project_demo_automations': expect.stringContaining('"name":"Wrap up"')
      });
    });

    it('upserts by id — saving an existing rule id replaces it instead of duplicating', async () => {
      persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': doneRuleJson });
      await actions.saveRule(context(
        { id: 'rule-1', name: 'Renamed', triggerType: 'checklist-completed', actionsJson: JSON.stringify([{ type: 'archive' }]) },
        'editor'
      ));
      const saved = JSON.parse(persistence.saveBoardSettings.mock.calls[0][0]['project_demo_automations']);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ id: 'rule-1', name: 'Renamed' });
    });

    it('rejects a rule with no name', async () => {
      const result = await actions.saveRule(context({ name: '', triggerType: 'checklist-completed', actionsJson: '[{"type":"archive"}]' }, 'editor'));
      expect(result).toMatchObject({ status: 400 });
      expect(persistence.saveBoardSettings).not.toHaveBeenCalled();
    });

    it('rejects a trigger lane that does not exist on this board', async () => {
      const result = await actions.saveRule(context({ name: 'x', triggerType: 'enters-lane', triggerLane: 'Nowhere', actionsJson: '[{"type":"archive"}]' }, 'editor'));
      expect(result).toMatchObject({ status: 400 });
    });

    it('rejects malformed actionsJson (falls through to the empty-actions rejection)', async () => {
      const result = await actions.saveRule(context({ name: 'x', triggerType: 'checklist-completed', actionsJson: 'not json' }, 'editor'));
      expect(result).toMatchObject({ status: 400 });
    });
  });

  describe('toggleRule', () => {
    it('rejects a viewer', async () => {
      persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': doneRuleJson });
      const result = await actions.toggleRule(context({ id: 'rule-1', enabled: 'false' }, 'viewer'));
      expect(result).toMatchObject({ status: 403 });
    });

    it('flips enabled and leaves the rest of the rule untouched', async () => {
      persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': doneRuleJson });
      const result = await actions.toggleRule(context({ id: 'rule-1', enabled: 'false' }, 'editor'));
      expect(result).toEqual({ message: 'Rule disabled.' });
      const saved = JSON.parse(persistence.saveBoardSettings.mock.calls[0][0]['project_demo_automations']);
      expect(saved[0]).toMatchObject({ id: 'rule-1', name: 'Existing rule', enabled: false });
    });

    it('rejects an unknown rule id', async () => {
      persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': doneRuleJson });
      const result = await actions.toggleRule(context({ id: 'nope', enabled: 'false' }, 'editor'));
      expect(result).toMatchObject({ status: 400 });
    });
  });

  describe('deleteRule', () => {
    it('rejects a viewer', async () => {
      persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': doneRuleJson });
      const result = await actions.deleteRule(context({ id: 'rule-1' }, 'viewer'));
      expect(result).toMatchObject({ status: 403 });
    });

    it('removes the rule and records activity', async () => {
      persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': doneRuleJson });
      const result = await actions.deleteRule(context({ id: 'rule-1' }, 'editor'));
      expect(result).toEqual({ message: 'Rule removed.' });
      expect(persistence.saveBoardSettings).toHaveBeenCalledWith({ 'project_demo_automations': '[]' });
      expect(persistence.recordProjectActivity).toHaveBeenCalled();
    });

    it('rejects deleting a rule that does not exist', async () => {
      persistence.loadBoardSettings.mockResolvedValue({ 'project_demo_lanes': '["Backlog","Doing","Done"]', 'project_demo_automations': doneRuleJson });
      const result = await actions.deleteRule(context({ id: 'nope' }, 'editor'));
      expect(result).toMatchObject({ status: 400 });
    });
  });
});
