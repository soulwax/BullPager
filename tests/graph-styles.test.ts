import { describe, expect, it } from 'vitest';
import {
  describeCondition,
  resolveNodeColor,
  sanitizeGraphStyleRule,
  sanitizeGraphStyleRules,
  type GraphStyleRule,
  type StyleableCard,
  type StyleableNode
} from '../src/lib/graphStyles';

function rule(overrides: Partial<GraphStyleRule> = {}): GraphStyleRule {
  return {
    id: 'style-1',
    name: 'Urgent cards',
    enabled: true,
    condition: { type: 'linked-card-priority', priority: 'urgent' },
    color: '#cf513f',
    ...overrides
  };
}

describe('sanitizeGraphStyleRule', () => {
  it('accepts a well-formed rule', () => {
    expect(sanitizeGraphStyleRule(rule())).toMatchObject({ name: 'Urgent cards', color: '#cf513f' });
  });

  it('rejects a rule with no name', () => {
    expect(sanitizeGraphStyleRule(rule({ name: '' }))).toBeNull();
  });

  it('rejects an invalid color', () => {
    expect(sanitizeGraphStyleRule(rule({ color: 'red' }))).toBeNull();
    expect(sanitizeGraphStyleRule(rule({ color: '#zzzzzz' }))).toBeNull();
  });

  it('rejects an unrecognized condition type', () => {
    expect(sanitizeGraphStyleRule({ ...rule(), condition: { type: 'title-contains', text: 'x' } })).toBeNull();
  });

  it('rejects a node-kind condition with an invalid kind', () => {
    expect(sanitizeGraphStyleRule({ ...rule(), condition: { type: 'node-kind', kind: 'sticky-note' } })).toBeNull();
  });

  it('accepts a node-kind and a linked-card-archived condition', () => {
    expect(sanitizeGraphStyleRule({ ...rule(), condition: { type: 'node-kind', kind: 'group' } })?.condition).toEqual({ type: 'node-kind', kind: 'group' });
    expect(sanitizeGraphStyleRule({ ...rule(), condition: { type: 'linked-card-archived' } })?.condition).toEqual({ type: 'linked-card-archived' });
  });

  it('defaults enabled to true when omitted, but respects an explicit false', () => {
    expect(sanitizeGraphStyleRule({ name: 'x', condition: { type: 'linked-card-archived' }, color: '#000000' })?.enabled).toBe(true);
    expect(sanitizeGraphStyleRule(rule({ enabled: false }))?.enabled).toBe(false);
  });
});

describe('sanitizeGraphStyleRules', () => {
  it('filters invalid entries and caps the list at 20', () => {
    const raw = [rule(), { name: '' }, ...Array.from({ length: 25 }, (_, i) => rule({ id: `r${i}`, name: `Rule ${i}` }))];
    const result = sanitizeGraphStyleRules(raw);
    expect(result.length).toBe(20);
  });

  it('returns an empty array for non-array input', () => {
    expect(sanitizeGraphStyleRules(null)).toEqual([]);
    expect(sanitizeGraphStyleRules('nope')).toEqual([]);
  });
});

describe('describeCondition', () => {
  it('reads as one plain sentence fragment per condition type', () => {
    expect(describeCondition({ type: 'node-kind', kind: 'group' })).toBe('the object is a group');
    expect(describeCondition({ type: 'linked-card-priority', priority: 'high' })).toBe("the linked card's priority is high");
    expect(describeCondition({ type: 'linked-card-archived' })).toBe('the linked card is archived');
  });
});

describe('resolveNodeColor', () => {
  const cardById = new Map<string, StyleableCard>([
    ['card-urgent', { priority: 'urgent', archived: false }],
    ['card-done', { priority: 'normal', archived: true }]
  ]);
  const fallback = '#5E9CFF';

  it('falls back to the node\'s own color when no rule matches', () => {
    const node: StyleableNode = { kind: 'note', cardId: null };
    expect(resolveNodeColor(node, fallback, [rule()], cardById)).toBe(fallback);
  });

  it('applies a matching linked-card-priority rule', () => {
    const node: StyleableNode = { kind: 'card', cardId: 'card-urgent' };
    expect(resolveNodeColor(node, fallback, [rule()], cardById)).toBe('#cf513f');
  });

  it('does not apply a priority rule to an unlinked node', () => {
    const node: StyleableNode = { kind: 'card', cardId: null };
    expect(resolveNodeColor(node, fallback, [rule()], cardById)).toBe(fallback);
  });

  it('applies a node-kind rule regardless of card link', () => {
    const groupRule = rule({ id: 'g', condition: { type: 'node-kind', kind: 'group' }, color: '#9b8afb' });
    expect(resolveNodeColor({ kind: 'group', cardId: null }, fallback, [groupRule], cardById)).toBe('#9b8afb');
    expect(resolveNodeColor({ kind: 'note', cardId: null }, fallback, [groupRule], cardById)).toBe(fallback);
  });

  it('applies a linked-card-archived rule', () => {
    const archivedRule = rule({ id: 'a', condition: { type: 'linked-card-archived' }, color: '#5e6c84' });
    expect(resolveNodeColor({ kind: 'card', cardId: 'card-done' }, fallback, [archivedRule], cardById)).toBe('#5e6c84');
    expect(resolveNodeColor({ kind: 'card', cardId: 'card-urgent' }, fallback, [archivedRule], cardById)).toBe(fallback);
  });

  it('skips a disabled rule', () => {
    const node: StyleableNode = { kind: 'card', cardId: 'card-urgent' };
    expect(resolveNodeColor(node, fallback, [rule({ enabled: false })], cardById)).toBe(fallback);
  });

  it('uses the first matching rule in order when several could match', () => {
    const first = rule({ id: 'first', color: '#111111' });
    const second = rule({ id: 'second', color: '#222222' });
    const node: StyleableNode = { kind: 'card', cardId: 'card-urgent' };
    expect(resolveNodeColor(node, fallback, [first, second], cardById)).toBe('#111111');
    expect(resolveNodeColor(node, fallback, [second, first], cardById)).toBe('#222222');
  });
});
