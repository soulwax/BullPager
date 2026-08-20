/**
 * Graph style rules — the FigJam-style editor's "style sheet," in the same
 * spirit as `automation.ts`: a declarative rule set rather than an embedded
 * scripting language. No code to sandbox, no new attack surface, and it
 * reuses a pattern this codebase already ships and trusts.
 *
 * Unlike automation, a style rule never mutates anything. It's a pure
 * function computed fresh at render time — `node.color` is what a person
 * manually picked (still the visible default when nothing matches), and a
 * rule only *overrides* the color actually drawn, never the stored one. A
 * linked card's priority or archived state changing therefore repaints the
 * node automatically the next time the graph loads, with nothing to keep in
 * sync and nothing that can drift stale — which is also what makes this the
 * "integrate into a card" half of the ask, not just a styling feature: a
 * card-linked node's color is a live reflection of that card, not a
 * snapshot taken when the node was created.
 */

export type GraphNodeKind = 'note' | 'card' | 'group';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export const nodeKinds: GraphNodeKind[] = ['note', 'card', 'group'];
export const priorities: Priority[] = ['low', 'normal', 'high', 'urgent'];

export type GraphStyleCondition =
  | { type: 'node-kind'; kind: GraphNodeKind }
  | { type: 'linked-card-priority'; priority: Priority }
  | { type: 'linked-card-archived' };

export type GraphStyleRule = {
  id: string;
  name: string;
  enabled: boolean;
  condition: GraphStyleCondition;
  color: string;
};

export const conditionTypes: { id: GraphStyleCondition['type']; label: string }[] = [
  { id: 'node-kind', label: 'Object type is…' },
  { id: 'linked-card-priority', label: "Linked card's priority is…" },
  { id: 'linked-card-archived', label: 'Linked card is archived' }
];

export function describeCondition(condition: GraphStyleCondition): string {
  switch (condition.type) {
    case 'node-kind': return `the object is a ${condition.kind}`;
    case 'linked-card-priority': return `the linked card's priority is ${condition.priority}`;
    case 'linked-card-archived': return 'the linked card is archived';
  }
}

function sanitizeCondition(raw: unknown): GraphStyleCondition | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  switch (value.type) {
    case 'node-kind':
      return typeof value.kind === 'string' && (nodeKinds as string[]).includes(value.kind) ? { type: 'node-kind', kind: value.kind as GraphNodeKind } : null;
    case 'linked-card-priority':
      return typeof value.priority === 'string' && (priorities as string[]).includes(value.priority) ? { type: 'linked-card-priority', priority: value.priority as Priority } : null;
    case 'linked-card-archived':
      return { type: 'linked-card-archived' };
    default:
      return null;
  }
}

export function sanitizeGraphStyleRule(raw: unknown): GraphStyleRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '';
  if (!name) return null;
  const condition = sanitizeCondition(value.condition);
  if (!condition) return null;
  const color = typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : null;
  if (!color) return null;
  const id = typeof value.id === 'string' && value.id ? value.id : `style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, name, enabled: value.enabled !== false, condition, color };
}

export function sanitizeGraphStyleRules(raw: unknown): GraphStyleRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeGraphStyleRule).filter((rule): rule is GraphStyleRule => rule !== null).slice(0, 20);
}

export type StyleableNode = { kind: GraphNodeKind; cardId: string | null };
export type StyleableCard = { priority: Priority; archived: boolean };

function conditionMatches(condition: GraphStyleCondition, node: StyleableNode, card: StyleableCard | undefined): boolean {
  switch (condition.type) {
    case 'node-kind': return node.kind === condition.kind;
    case 'linked-card-priority': return card?.priority === condition.priority;
    case 'linked-card-archived': return card?.archived === true;
  }
}

/** The color actually drawn for a node: the first enabled rule that
 * matches, in board order, or the node's own stored color if none do. */
export function resolveNodeColor(
  node: StyleableNode,
  fallbackColor: string,
  rules: readonly GraphStyleRule[],
  cardById: ReadonlyMap<string, StyleableCard>
): string {
  const card = node.cardId ? cardById.get(node.cardId) : undefined;
  for (const rule of rules) {
    if (rule.enabled && conditionMatches(rule.condition, node, card)) return rule.color;
  }
  return fallbackColor;
}
