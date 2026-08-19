/**
 * Board automation (Trello's own name for this is "Butler") — the feature
 * that actually makes Trello more than a drag-and-drop kanban board: rules
 * that react to what already happened on the board instead of the board
 * only ever doing what a person clicked. This module is the pure rule
 * engine; the route layer (`+page.server.ts`) owns loading/saving rules as a
 * board setting and calling into it after a card actually changes.
 *
 * Deliberately single-pass: a rule's own actions are applied once against
 * the triggering event and never re-evaluated against the other rules on the
 * board. A rule that moves a card into a lane another rule also triggers on
 * will not cascade into that second rule in the same pass — the same
 * loop-safety trade real automation systems make, kept simple here rather
 * than building a recursion budget for a first version.
 */

export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

export type AutomationTrigger = { type: 'enters-lane'; lane: string } | { type: 'checklist-completed' };

export type AutomationAction =
  | { type: 'move-to-lane'; lane: string }
  | { type: 'add-tag'; tagId: string }
  | { type: 'remove-tag'; tagId: string }
  | { type: 'set-priority'; priority: Priority }
  | { type: 'mark-due-complete' }
  | { type: 'archive' };

export type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
};

export const triggerTypes: { id: AutomationTrigger['type']; label: string }[] = [
  { id: 'enters-lane', label: 'A card is moved into…' },
  { id: 'checklist-completed', label: "A card's checklist is completed" }
];

export const actionTypes: { id: AutomationAction['type']; label: string }[] = [
  { id: 'move-to-lane', label: 'Move the card to…' },
  { id: 'add-tag', label: 'Add the label…' },
  { id: 'remove-tag', label: 'Remove the label…' },
  { id: 'set-priority', label: 'Set priority to…' },
  { id: 'mark-due-complete', label: 'Mark the due date complete' },
  { id: 'archive', label: 'Archive the card' }
];

/** Renders a rule as one readable sentence, for the rule list and for the
 * activity log entry an automation run leaves behind. */
export function describeTrigger(trigger: AutomationTrigger): string {
  return trigger.type === 'enters-lane' ? `a card is moved into “${trigger.lane}”` : "a card's checklist is completed";
}

export function describeAction(action: AutomationAction, tagNameById: ReadonlyMap<string, string>): string {
  switch (action.type) {
    case 'move-to-lane': return `move it to “${action.lane}”`;
    case 'add-tag': return `add the “${tagNameById.get(action.tagId) ?? action.tagId}” label`;
    case 'remove-tag': return `remove the “${tagNameById.get(action.tagId) ?? action.tagId}” label`;
    case 'set-priority': return `set priority to ${action.priority}`;
    case 'mark-due-complete': return 'mark its due date complete';
    case 'archive': return 'archive it';
  }
}

function sanitizeTrigger(raw: unknown, lanes: readonly string[]): AutomationTrigger | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.type === 'enters-lane' && typeof value.lane === 'string' && lanes.includes(value.lane)) return { type: 'enters-lane', lane: value.lane };
  if (value.type === 'checklist-completed') return { type: 'checklist-completed' };
  return null;
}

function sanitizeAction(raw: unknown, lanes: readonly string[], tagIds: readonly string[]): AutomationAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  switch (value.type) {
    case 'move-to-lane':
      return typeof value.lane === 'string' && lanes.includes(value.lane) ? { type: 'move-to-lane', lane: value.lane } : null;
    case 'add-tag':
      return typeof value.tagId === 'string' && tagIds.includes(value.tagId) ? { type: 'add-tag', tagId: value.tagId } : null;
    case 'remove-tag':
      return typeof value.tagId === 'string' && tagIds.includes(value.tagId) ? { type: 'remove-tag', tagId: value.tagId } : null;
    case 'set-priority':
      return typeof value.priority === 'string' && (PRIORITIES as string[]).includes(value.priority) ? { type: 'set-priority', priority: value.priority as Priority } : null;
    case 'mark-due-complete':
      return { type: 'mark-due-complete' };
    case 'archive':
      return { type: 'archive' };
    default:
      return null;
  }
}

/** Validates a rule against the board's *current* lanes and tags, so a rule
 * left over from a deleted list or label silently drops (never half-applies
 * against a lane that no longer exists) instead of erroring the whole save. */
export function sanitizeAutomationRule(raw: unknown, lanes: readonly string[], tagIds: readonly string[]): AutomationRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '';
  if (!name) return null;
  const trigger = sanitizeTrigger(value.trigger, lanes);
  if (!trigger) return null;
  const actions = Array.isArray(value.actions)
    ? value.actions.map((action) => sanitizeAction(action, lanes, tagIds)).filter((action): action is AutomationAction => action !== null)
    : [];
  if (!actions.length) return null;
  const id = typeof value.id === 'string' && value.id ? value.id : `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, name, enabled: value.enabled !== false, trigger, actions: actions.slice(0, 6) };
}

export function sanitizeAutomationRules(raw: unknown, lanes: readonly string[], tagIds: readonly string[]): AutomationRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((rule) => sanitizeAutomationRule(rule, lanes, tagIds)).filter((rule): rule is AutomationRule => rule !== null).slice(0, 20);
}

export type AutomationEvent = { type: 'enters-lane'; lane: string } | { type: 'checklist-completed' };

function triggerMatches(trigger: AutomationTrigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  return trigger.type === 'enters-lane' && event.type === 'enters-lane' ? trigger.lane === event.lane : true;
}

/** The enabled rules that fire for this event, in board order — the order
 * their combined actions apply in when more than one rule matches. */
export function matchingRules(rules: readonly AutomationRule[], event: AutomationEvent): AutomationRule[] {
  return rules.filter((rule) => rule.enabled && triggerMatches(rule.trigger, event));
}

/** The subset of a card's fields automation can change, decoupled from the
 * full `ProjectCard`/`ProjectCardWrite` shape so this module has no
 * dependency on the persistence layer. */
export type AutomationCardState = { lane: string; tagIds: string[]; priority: Priority; dueComplete: boolean; archived: boolean };

export function applyAutomationActions(
  state: AutomationCardState,
  actions: readonly AutomationAction[],
  tagNameById: ReadonlyMap<string, string>
): { state: AutomationCardState; summary: string[] } {
  const next: AutomationCardState = { ...state, tagIds: [...state.tagIds] };
  const summary: string[] = [];
  for (const action of actions) {
    switch (action.type) {
      case 'move-to-lane':
        if (next.lane !== action.lane) { next.lane = action.lane; summary.push(describeAction(action, tagNameById)); }
        break;
      case 'add-tag':
        if (!next.tagIds.includes(action.tagId)) { next.tagIds.push(action.tagId); summary.push(describeAction(action, tagNameById)); }
        break;
      case 'remove-tag':
        if (next.tagIds.includes(action.tagId)) { next.tagIds = next.tagIds.filter((id) => id !== action.tagId); summary.push(describeAction(action, tagNameById)); }
        break;
      case 'set-priority':
        if (next.priority !== action.priority) { next.priority = action.priority; summary.push(describeAction(action, tagNameById)); }
        break;
      case 'mark-due-complete':
        if (!next.dueComplete) { next.dueComplete = true; summary.push(describeAction(action, tagNameById)); }
        break;
      case 'archive':
        if (!next.archived) { next.archived = true; summary.push(describeAction(action, tagNameById)); }
        break;
    }
  }
  return { state: next, summary };
}

/** Runs every matching rule against one event in board order, folding their
 * actions into a single resulting state and a flat, per-rule summary — the
 * route layer persists the result once and writes one activity entry. */
export function runAutomationEvent(
  state: AutomationCardState,
  rules: readonly AutomationRule[],
  event: AutomationEvent,
  tagNameById: ReadonlyMap<string, string>
): { state: AutomationCardState; ran: { rule: AutomationRule; summary: string[] }[] } {
  let working = state;
  const ran: { rule: AutomationRule; summary: string[] }[] = [];
  for (const rule of matchingRules(rules, event)) {
    const result = applyAutomationActions(working, rule.actions, tagNameById);
    working = result.state;
    if (result.summary.length) ran.push({ rule, summary: result.summary });
  }
  return { state: working, ran };
}
