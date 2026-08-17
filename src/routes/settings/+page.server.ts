import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createBoardUser, deleteBoardUser, listBoardProjects, listBoardUsers, loadBoardSettings, saveBoardSettings, updateBoardUserRole } from '$lib/server/persistence';
import type { UserRole } from '$lib/types';

const roles: UserRole[] = ['admin', 'editor', 'viewer'];
function canManage(role: UserRole | undefined) { return role === 'superadmin' || role === 'admin'; }
function isBootstrapSuperadmin(username: string) { return Boolean(username) && (username === (env.APP_LOGIN || '') || username.toLowerCase() === 'soulwax'); }
function roleFor(username: string, users: Awaited<ReturnType<typeof listBoardUsers>>) {
  if (isBootstrapSuperadmin(username)) return 'superadmin' as const;
  return users.find((user) => user.username === username)?.role ?? null;
}

export async function load({ locals }) {
  if (!canManage(locals.role)) throw redirect(303, '/');
  return { superadmin: env.APP_LOGIN || 'configured superadmin', users: await listBoardUsers(), projects: await listBoardProjects(), settings: await loadBoardSettings() };
}

export const actions = {
  createUser: async ({ request, locals }) => {
    if (!canManage(locals.role)) return fail(403, { error: 'Only administrators can manage users.' });
    const form = await request.formData();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const role = String(form.get('role') ?? '') as Exclude<UserRole, 'superadmin'>;
    if (!/^[a-zA-Z0-9._-]{3,48}$/.test(username)) return fail(400, { error: 'Use 3–48 letters, numbers, dots, underscores, or hyphens.' });
    if (password.length < 8) return fail(400, { error: 'Passwords must be at least 8 characters.' });
    if (!roles.includes(role)) return fail(400, { error: 'Choose a valid role.' });
    if (locals.role === 'admin' && role === 'admin') return fail(403, { error: 'Only the superadmin can create administrator accounts.' });
    try { await createBoardUser(username, password, role); return { message: `${username} created as ${role}.` }; }
    catch { return fail(409, { error: 'That username already exists.' }); }
  },
  saveSettings: async ({ request, locals }) => {
    if (!canManage(locals.role)) return fail(403, { error: 'Only administrators can change system settings.' });
    const form = await request.formData();
    const current = await loadBoardSettings();
    const registrationEnabled = form.has('registrationEnabled') ? (form.get('registrationEnabled') === 'on' ? 'true' : 'false') : (current.registration_enabled ?? 'true');
    const defaultRole = String(form.get('defaultRole') ?? current.default_role ?? 'viewer');
    const githubDefaultRole = String(form.get('githubDefaultRole') ?? current.github_default_role ?? 'viewer');
    const visibility = String(form.get('visibility') ?? current.project_visibility ?? 'private');
    const theme = String(form.get('theme') ?? current.theme ?? 'midnight');
    const accent = String(form.get('accent') ?? current.accent ?? '#73b6ff');
    const density = String(form.get('density') ?? current.density ?? 'comfortable');
    if (!['viewer', 'editor'].includes(defaultRole) || !['viewer', 'editor'].includes(githubDefaultRole) || !['private', 'shared'].includes(visibility) || !['midnight', 'ocean', 'light'].includes(theme) || !['comfortable', 'compact'].includes(density) || !/^#[0-9a-f]{6}$/i.test(accent)) return fail(400, { error: 'Choose valid setting values.' });
    await saveBoardSettings({ registration_enabled: registrationEnabled, default_role: defaultRole, github_default_role: githubDefaultRole, project_visibility: visibility, theme, accent, density });
    return { message: 'System settings saved.' };
  },
  updateRole: async ({ request, locals }) => {
    if (!canManage(locals.role)) return fail(403, { error: 'Only administrators can manage users.' });
    const form = await request.formData();
    const username = String(form.get('username') ?? '');
    const role = String(form.get('role') ?? '') as Exclude<UserRole, 'superadmin'>;
    if (!roles.includes(role) || !username) return fail(400, { error: 'Choose a valid role.' });
    const users = await listBoardUsers();
    const currentRole = roleFor(username, users);
    if (!currentRole) return fail(404, { error: 'That account no longer exists.' });
    if (currentRole === 'superadmin') return fail(403, { error: 'The superadmin account cannot be changed here.' });
    if (locals.role === 'admin' && currentRole === 'admin') return fail(403, { error: 'Administrators cannot change another administrator.' });
    await updateBoardUserRole(username, role);
    return { message: `${username} is now ${role}.` };
  },
  deleteUser: async ({ request, locals }) => {
    if (!canManage(locals.role)) return fail(403, { error: 'Only administrators can manage users.' });
    const username = String((await request.formData()).get('username') ?? '');
    if (!username) return fail(400, { error: 'Choose a user.' });
    const users = await listBoardUsers();
    const currentRole = roleFor(username, users);
    if (!currentRole) return fail(404, { error: 'That account no longer exists.' });
    if (currentRole === 'superadmin') return fail(403, { error: 'The superadmin account cannot be removed.' });
    if (locals.role === 'admin' && currentRole === 'admin') return fail(403, { error: 'Administrators cannot remove another administrator.' });
    await deleteBoardUser(username);
    return { message: `${username} removed.` };
  }
};
