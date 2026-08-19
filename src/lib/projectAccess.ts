import type { BoardProject, UserRole } from '$lib/types';

/**
 * How the project list is organised, and what a person may do with each entry.
 *
 * Two things this deliberately is *not*:
 *
 * 1. It is not a permission system. Access today is derived from the project's
 *    `owner`, its `visibility`, and the viewer's *global* role — there is no
 *    per-project membership table. This module reports that honestly rather
 *    than implying a finer model than the database holds.
 * 2. It does not filter. Every project the caller passes in comes back in some
 *    group. Narrowing who can *see* a private project is a route-level
 *    security change, not a layout change, and doing it here as a side effect
 *    of a list redesign would hide boards without anyone deciding to.
 */

/** What the viewer may do, most-privileged first. */
export type ProjectAccess = 'owner' | 'editor' | 'viewer';

export type ProjectGroupId = 'starred' | 'owned' | 'shared' | 'other';

export type ProjectEntry = {
  project: BoardProject;
  access: ProjectAccess;
  starred: boolean;
};

export type ProjectGroup = {
  id: ProjectGroupId;
  title: string;
  hint: string;
  projects: ProjectEntry[];
};

const EDITING_ROLES: readonly string[] = ['superadmin', 'admin', 'editor'];

export function canCreateProjects(role: UserRole | string | undefined): boolean {
  return EDITING_ROLES.includes(role ?? '');
}

/**
 * Ownership outranks role: a project's owner keeps `owner` access even if
 * their global role is later reduced, because the board list should not
 * silently reattribute someone's own workspace.
 */
export function accessFor(
  project: BoardProject,
  viewer: { username: string; role: UserRole | string }
): ProjectAccess {
  if (viewer.username && project.owner === viewer.username) return 'owner';
  return EDITING_ROLES.includes(viewer.role) ? 'editor' : 'viewer';
}

export const accessLabel: Record<ProjectAccess, string> = {
  owner: 'You own this',
  editor: 'You can edit',
  viewer: 'You can view'
};

const GROUP_META: Record<ProjectGroupId, { title: string; hint: string }> = {
  starred: { title: 'Starred', hint: 'Boards you pinned to the top.' },
  owned: { title: 'Your boards', hint: 'Workspaces you created and own.' },
  shared: { title: 'Shared with the workspace', hint: 'Boards anyone signed in can open.' },
  other: { title: 'Other boards', hint: 'Private boards owned by someone else.' }
};

export function groupProjects(
  projects: BoardProject[],
  viewer: { username: string; role: UserRole | string; starred: Set<string> | string[] }
): ProjectGroup[] {
  const starred = viewer.starred instanceof Set ? viewer.starred : new Set(viewer.starred);
  const entries: ProjectEntry[] = projects.map((project) => ({
    project,
    access: accessFor(project, viewer),
    starred: starred.has(project.slug)
  }));

  const bucket = (entry: ProjectEntry): ProjectGroupId => {
    if (entry.starred) return 'starred';
    if (entry.access === 'owner') return 'owned';
    return entry.project.visibility === 'shared' ? 'shared' : 'other';
  };

  const order: ProjectGroupId[] = ['starred', 'owned', 'shared', 'other'];
  return order
    .map((id) => ({
      id,
      ...GROUP_META[id],
      projects: entries
        .filter((entry) => bucket(entry) === id)
        .sort((a, b) => a.project.name.localeCompare(b.project.name))
    }))
    // An empty group is noise on a list whose whole job is to be scannable.
    .filter((group) => group.projects.length > 0);
}

/** Two initials for the board tile, so a list of boards is scannable by shape. */
export function projectMark(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
