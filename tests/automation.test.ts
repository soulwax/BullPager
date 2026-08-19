import { describe, expect, it } from 'vitest';
import {
  applyAutomationActions,
  matchingRules,
  runAutomationEvent,
  sanitizeAutomationRule,
  sanitizeAutomationRules,
  type AutomationCardState,
  type AutomationRule
} from '../src/lib/automation';

const lanes = ['Backlog', 'Doing', 'Done'];
const tagIds = ['tag-1', 'tag-2'];
const tagNameById = new Map([['tag-1', 'Shipped'], ['tag-2', 'Blocked']]);

const baseState: AutomationCardState = { lane: 'Doing', tagIds: [], priority: 'normal', dueComplete: false, archived: false };

function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: 'rule-1',
    name: 'Ship it',
    enabled: true,
    trigger: { type: 'enters-lane', lane: 'Done' },
    actions: [{ type: 'set-priority', priority: 'low' }],
    ...overrides
  };
}

describe('sanitizeAutomationRule', () => {
  it('accepts a well-formed rule', () => {
    const result = sanitizeAutomationRule(rule(), lanes, tagIds);
    expect(result).toMatchObject({ name: 'Ship it', enabled: true });
  });

  it('rejects a rule with no name', () => {
    expect(sanitizeAutomationRule(rule({ name: '' }), lanes, tagIds)).toBeNull();
  });

  it('rejects a trigger pointing at a lane that no longer exists', () => {
    const result = sanitizeAutomationRule(rule({ trigger: { type: 'enters-lane', lane: 'Deleted List' } }), lanes, tagIds);
    expect(result).toBeNull();
  });

  it('drops an individual action referencing a deleted tag but keeps the rule if another action survives', () => {
    const result = sanitizeAutomationRule(
      rule({ actions: [{ type: 'add-tag', tagId: 'gone' }, { type: 'archive' }] }),
      lanes,
      tagIds
    );
    expect(result?.actions).toEqual([{ type: 'archive' }]);
  });

  it('rejects a rule whose every action was dropped', () => {
    const result = sanitizeAutomationRule(rule({ actions: [{ type: 'move-to-lane', lane: 'Nowhere' }] }), lanes, tagIds);
    expect(result).toBeNull();
  });

  it('accepts a checklist-completed trigger with no lane', () => {
    const result = sanitizeAutomationRule(rule({ trigger: { type: 'checklist-completed' } }), lanes, tagIds);
    expect(result?.trigger).toEqual({ type: 'checklist-completed' });
  });

  it('defaults enabled to true when omitted, but respects an explicit false', () => {
    expect(sanitizeAutomationRule({ name: 'x', trigger: { type: 'checklist-completed' }, actions: [{ type: 'archive' }] }, lanes, tagIds)?.enabled).toBe(true);
    expect(sanitizeAutomationRule(rule({ enabled: false }), lanes, tagIds)?.enabled).toBe(false);
  });
});

describe('sanitizeAutomationRules', () => {
  it('filters out invalid rules and caps the list at 20', () => {
    const raw = [rule(), { name: '' }, ...Array.from({ length: 25 }, (_, i) => rule({ id: `r${i}`, name: `Rule ${i}` }))];
    const result = sanitizeAutomationRules(raw, lanes, tagIds);
    expect(result.length).toBe(20);
    expect(result.every((r) => r.name)).toBe(true);
  });

  it('returns an empty array for non-array input', () => {
    expect(sanitizeAutomationRules(null, lanes, tagIds)).toEqual([]);
    expect(sanitizeAutomationRules('nope', lanes, tagIds)).toEqual([]);
  });
});

describe('matchingRules', () => {
  it('matches an enters-lane trigger only for its own lane', () => {
    const rules = [rule({ id: 'a', trigger: { type: 'enters-lane', lane: 'Done' } }), rule({ id: 'b', trigger: { type: 'enters-lane', lane: 'Doing' } })];
    expect(matchingRules(rules, { type: 'enters-lane', lane: 'Done' }).map((r) => r.id)).toEqual(['a']);
  });

  it('skips a disabled rule even if its trigger matches', () => {
    const rules = [rule({ enabled: false })];
    expect(matchingRules(rules, { type: 'enters-lane', lane: 'Done' })).toEqual([]);
  });

  it('matches checklist-completed regardless of lane', () => {
    const rules = [rule({ trigger: { type: 'checklist-completed' } })];
    expect(matchingRules(rules, { type: 'checklist-completed' })).toHaveLength(1);
  });
});

describe('applyAutomationActions', () => {
  it('applies move, tag, priority, due-complete, and archive together, each described in order', () => {
    const { state, summary } = applyAutomationActions(
      baseState,
      [
        { type: 'move-to-lane', lane: 'Done' },
        { type: 'add-tag', tagId: 'tag-1' },
        { type: 'set-priority', priority: 'urgent' },
        { type: 'mark-due-complete' },
        { type: 'archive' }
      ],
      tagNameById
    );
    expect(state).toEqual({ lane: 'Done', tagIds: ['tag-1'], priority: 'urgent', dueComplete: true, archived: true });
    expect(summary).toEqual(['move it to “Done”', 'add the “Shipped” label', 'set priority to urgent', 'mark its due date complete', 'archive it']);
  });

  it('removes a tag the card already has', () => {
    const { state } = applyAutomationActions({ ...baseState, tagIds: ['tag-1', 'tag-2'] }, [{ type: 'remove-tag', tagId: 'tag-1' }], tagNameById);
    expect(state.tagIds).toEqual(['tag-2']);
  });

  it('produces no summary entry, and does not touch state, for a no-op action', () => {
    const alreadyThere: AutomationCardState = { ...baseState, lane: 'Done', dueComplete: true };
    const { state, summary } = applyAutomationActions(alreadyThere, [{ type: 'move-to-lane', lane: 'Done' }, { type: 'mark-due-complete' }], tagNameById);
    expect(summary).toEqual([]);
    expect(state).toEqual(alreadyThere);
  });
});

describe('runAutomationEvent', () => {
  it('folds two matching rules into one resulting state and reports both by name', () => {
    const rules = [
      rule({ id: 'a', name: 'Set low priority', trigger: { type: 'enters-lane', lane: 'Done' }, actions: [{ type: 'set-priority', priority: 'low' }] }),
      rule({ id: 'b', name: 'Tag shipped', trigger: { type: 'enters-lane', lane: 'Done' }, actions: [{ type: 'add-tag', tagId: 'tag-1' }] })
    ];
    const { state, ran } = runAutomationEvent(baseState, rules, { type: 'enters-lane', lane: 'Done' }, tagNameById);
    expect(state.priority).toBe('low');
    expect(state.tagIds).toEqual(['tag-1']);
    expect(ran.map((entry) => entry.rule.name)).toEqual(['Set low priority', 'Tag shipped']);
  });

  it('does not cascade — a rule moving a card into a lane does not also fire a second rule triggered by that lane', () => {
    const rules = [
      rule({ id: 'a', name: 'Move to Done', trigger: { type: 'checklist-completed' }, actions: [{ type: 'move-to-lane', lane: 'Done' }] }),
      rule({ id: 'b', name: 'Archive on Done entry', trigger: { type: 'enters-lane', lane: 'Done' }, actions: [{ type: 'archive' }] })
    ];
    const { state, ran } = runAutomationEvent(baseState, rules, { type: 'checklist-completed' }, tagNameById);
    expect(state.lane).toBe('Done');
    expect(state.archived).toBe(false);
    expect(ran.map((entry) => entry.rule.id)).toEqual(['a']);
  });

  it('reports nothing ran when no rule matches', () => {
    const { ran } = runAutomationEvent(baseState, [rule()], { type: 'checklist-completed' }, tagNameById);
    expect(ran).toEqual([]);
  });
});
