import type { ProjectCard, ProjectViewState } from '$lib/types';

export const projectPriorities = ['low', 'normal', 'high', 'urgent'] as const;
export type ProjectPriority = (typeof projectPriorities)[number];

export function projectPrefix(slug: string) {
  return `project_${slug}_`;
}

export function lanesFromSettings(settings: Record<string, string>, prefix: string): string[] {
  try {
    const saved: unknown = JSON.parse(settings[`${prefix}lanes`] ?? '[]');
    if (Array.isArray(saved)) {
      const lanes = saved
        .filter((lane): lane is string => typeof lane === 'string' && Boolean(lane.trim()))
        .map((lane) => lane.trim())
        .filter((lane, index, all) => all.indexOf(lane) === index);
      if (lanes.length >= 2 && lanes.length <= 8) return lanes;
    }
  } catch { /* use a safe empty-board fallback */ }
  return ['Backlog', 'In progress', 'Done'];
}

export function mergeProjectLanes(configured: string[], cards: Pick<ProjectCard, 'lane'>[]): string[] {
  const archived = cards.map((card) => card.lane).filter((lane, index, all) => !configured.includes(lane) && all.indexOf(lane) === index);
  return [...configured, ...archived];
}

/** Return a fully reindexed optimistic snapshot for a Kanban move. */
export function moveProjectCard(cards: ProjectCard[], cardId: string, lane: string, beforeId = ''): ProjectCard[] {
  const moving = cards.find((card) => card.id === cardId);
  if (!moving) return cards;
  const remaining = cards.filter((card) => card.id !== cardId);
  const destination = { ...moving, lane };
  let insertAt = beforeId ? remaining.findIndex((card) => card.id === beforeId && card.lane === lane) : -1;
  if (insertAt < 0) {
    const laneIndexes = remaining.flatMap((card, index) => card.lane === lane ? [index] : []);
    insertAt = laneIndexes.length ? laneIndexes[laneIndexes.length - 1] + 1 : remaining.length;
  }
  remaining.splice(insertAt, 0, destination);
  const nextPosition = new Map<string, number>();
  return remaining.map((card) => {
    const position = nextPosition.get(card.lane) ?? 0;
    nextPosition.set(card.lane, position + 1);
    return { ...card, position };
  });
}

export function validDueDate(value: string | null) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validProjectCardInput(input: { title: string; details: string; lane: string; priority: string; dueDate: string | null }, lanes: string[]) {
  return input.title.length >= 1 && input.title.length <= 160 && input.details.length <= 4000 && lanes.includes(input.lane) && projectPriorities.includes(input.priority as ProjectPriority) && validDueDate(input.dueDate);
}

export function sanitizeProjectViewState(raw: unknown): ProjectViewState {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const collapsed: Record<string, boolean> = {};
  if (source.collapsed && typeof source.collapsed === 'object') {
    for (const [key, value] of Object.entries(source.collapsed as Record<string, unknown>)) {
      if (key.length <= 80 && typeof value === 'boolean') collapsed[key] = value;
    }
  }
  return {
    density: source.density === 'compact' ? 'compact' : source.density === 'comfortable' ? 'comfortable' : undefined,
    collapsed,
    query: typeof source.query === 'string' ? source.query.trim().slice(0, 120) : undefined,
    priority: ['all', 'low', 'normal', 'high', 'urgent'].includes(String(source.priority)) ? source.priority as ProjectViewState['priority'] : undefined,
    tag: typeof source.tag === 'string' ? source.tag.trim().slice(0, 120) : undefined,
    assignee: typeof source.assignee === 'string' ? source.assignee.trim().slice(0, 120) : undefined,
    showArchived: source.showArchived === true
  };
}
