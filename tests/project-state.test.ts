import { describe, expect, it } from 'vitest';
import { projectTemplates } from '../src/lib/projectTemplates';
import { lanesFromSettings, mergeProjectLanes, sanitizeProjectViewState, validDueDate, validProjectCardInput } from '../src/lib/projectState';

describe('project templates', () => {
  it('has unique ids and usable workflows', () => {
    const ids = projectTemplates.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of projectTemplates) {
      expect(template.name.length).toBeGreaterThan(2);
      expect(template.lanes.length).toBeGreaterThanOrEqual(2);
      expect(new Set(template.lanes).size).toBe(template.lanes.length);
    }
  });
});

describe('project state helpers', () => {
  it('falls back safely and removes duplicate lane names', () => {
    expect(lanesFromSettings({ 'project_demo_lanes': '["Ideas", "Ideas", "Done"]' }, 'project_demo_')).toEqual(['Ideas', 'Done']);
    expect(lanesFromSettings({ 'project_demo_lanes': 'not json' }, 'project_demo_')).toEqual(['Backlog', 'In progress', 'Done']);
  });

  it('keeps cards visible when a lane is renamed', () => {
    expect(mergeProjectLanes(['Backlog', 'Done'], [{ lane: 'Review' }, { lane: 'Review' }, { lane: 'Done' }])).toEqual(['Backlog', 'Done', 'Review']);
  });

  it('rejects impossible due dates', () => {
    expect(validDueDate(null)).toBe(true);
    expect(validDueDate('2026-02-28')).toBe(true);
    expect(validDueDate('2026-02-30')).toBe(false);
    expect(validDueDate('28/02/2026')).toBe(false);
  });

  it('validates card fields and priorities', () => {
    const base = { title: 'Prepare brief', details: '', lane: 'Ready', priority: 'normal', dueDate: '2026-08-20' };
    expect(validProjectCardInput(base, ['Backlog', 'Ready', 'Done'])).toBe(true);
    expect(validProjectCardInput({ ...base, priority: 'critical' }, ['Backlog', 'Ready', 'Done'])).toBe(false);
    expect(validProjectCardInput({ ...base, lane: 'Unknown' }, ['Backlog', 'Ready', 'Done'])).toBe(false);
    expect(validProjectCardInput({ ...base, title: '' }, ['Backlog', 'Ready', 'Done'])).toBe(false);
  });

  it('sanitizes per-user view state', () => {
    expect(sanitizeProjectViewState({ density: 'compact', collapsed: { Ready: true, Done: false, bad: 'yes' } })).toEqual({ density: 'compact', collapsed: { Ready: true, Done: false }, query: undefined, priority: undefined, tag: undefined, showArchived: false });
    expect(sanitizeProjectViewState({ density: 'wide', collapsed: null })).toEqual({ density: undefined, collapsed: {}, query: undefined, priority: undefined, tag: undefined, showArchived: false });
    expect(sanitizeProjectViewState(null)).toEqual({});
  });
});
