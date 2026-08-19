import { describe, expect, it } from 'vitest';
import { accessFor, canCreateProjects, groupProjects, projectMark } from '../src/lib/projectAccess';
import type { BoardProject } from '../src/lib/types';

const project = (over: Partial<BoardProject> = {}): BoardProject => ({
  slug: 'demo',
  name: 'Demo board',
  owner: 'ada',
  visibility: 'private',
  ...over
});

describe('accessFor', () => {
  it('reports ownership before role', () => {
    // A demoted owner still owns their board; the list must not reattribute it.
    expect(accessFor(project({ owner: 'ada' }), { username: 'ada', role: 'viewer' })).toBe('owner');
  });

  it('derives edit rights from the global role for boards you do not own', () => {
    expect(accessFor(project({ owner: 'grace' }), { username: 'ada', role: 'editor' })).toBe('editor');
    expect(accessFor(project({ owner: 'grace' }), { username: 'ada', role: 'admin' })).toBe('editor');
    expect(accessFor(project({ owner: 'grace' }), { username: 'ada', role: 'viewer' })).toBe('viewer');
  });

  it('never calls an anonymous visitor an owner, even of an unowned board', () => {
    expect(accessFor(project({ owner: '' }), { username: '', role: 'viewer' })).toBe('viewer');
  });
});

describe('groupProjects', () => {
  const viewer = { username: 'ada', role: 'editor' as const, starred: new Set<string>() };

  it('sorts a board into exactly one group, starred winning over ownership', () => {
    const groups = groupProjects([project({ slug: 'mine', owner: 'ada' })], { ...viewer, starred: new Set(['mine']) });
    expect(groups.map((group) => group.id)).toEqual(['starred']);
    expect(groups[0].projects[0].starred).toBe(true);
  });

  it('separates owned, shared, and other boards', () => {
    const groups = groupProjects(
      [
        project({ slug: 'mine', name: 'Mine', owner: 'ada' }),
        project({ slug: 'ours', name: 'Ours', owner: 'grace', visibility: 'shared' }),
        project({ slug: 'theirs', name: 'Theirs', owner: 'grace', visibility: 'private' })
      ],
      viewer
    );
    expect(groups.map((group) => group.id)).toEqual(['owned', 'shared', 'other']);
    expect(groups.map((group) => group.projects.map((entry) => entry.project.slug))).toEqual([['mine'], ['ours'], ['theirs']]);
  });

  it('drops empty groups so the list stays scannable', () => {
    const groups = groupProjects([project({ owner: 'ada' })], viewer);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('owned');
  });

  it('returns every project it is given — grouping is not filtering', () => {
    const projects = [
      project({ slug: 'a', owner: 'grace', visibility: 'private' }),
      project({ slug: 'b', owner: 'grace', visibility: 'shared' })
    ];
    const total = groupProjects(projects, { username: 'ada', role: 'viewer', starred: [] })
      .reduce((sum, group) => sum + group.projects.length, 0);
    expect(total).toBe(projects.length);
  });

  it('orders boards within a group by name', () => {
    const groups = groupProjects(
      [project({ slug: 'z', name: 'Zebra', owner: 'ada' }), project({ slug: 'a', name: 'Apple', owner: 'ada' })],
      viewer
    );
    expect(groups[0].projects.map((entry) => entry.project.name)).toEqual(['Apple', 'Zebra']);
  });

  it('accepts starred as an array as well as a set', () => {
    const groups = groupProjects([project({ slug: 'mine', owner: 'ada' })], { ...viewer, starred: ['mine'] });
    expect(groups[0].id).toBe('starred');
  });
});

describe('canCreateProjects', () => {
  it('allows editors and above only', () => {
    expect(canCreateProjects('superadmin')).toBe(true);
    expect(canCreateProjects('admin')).toBe(true);
    expect(canCreateProjects('editor')).toBe(true);
    expect(canCreateProjects('viewer')).toBe(false);
    expect(canCreateProjects(undefined)).toBe(false);
  });
});

describe('projectMark', () => {
  it('uses the first letter of the first two words', () => {
    expect(projectMark('Unity implementation board')).toBe('UI');
  });

  it('falls back to two letters for a single word, and never throws on empty', () => {
    expect(projectMark('Quarantine')).toBe('QU');
    expect(projectMark('   ')).toBe('??');
  });
});
