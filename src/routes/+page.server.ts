import { fail, redirect } from '@sveltejs/kit';
import { endSession, sessionCookie } from '$lib/server/auth';
import { listBoardProjects, listProjectCounts, listStarredProjectSlugs, revokeAllSessionsForUser, setProjectStar } from '$lib/server/persistence';
import { groupProjects } from '$lib/projectAccess';

/**
 * The site's front door is the project list.
 *
 * It used to redirect straight to the Unity board, which made one project the
 * whole application: the board was the home page, the nav hard-coded a link to
 * it, and every other project was reachable only through a secondary hub. The
 * plan-file tool that lived here moved to `/plan`.
 *
 * There is one project today. The point of this page is that nothing about the
 * shape of the app says so.
 */
export async function load({ locals }) {
  const username = locals.username ?? '';
  const role = locals.role ?? '';
  const [projects, starred, counts] = await Promise.all([
    listBoardProjects(),
    listStarredProjectSlugs(username),
    listProjectCounts()
  ]);
  return {
    groups: groupProjects(projects, { username, role, starred }),
    counts,
    starred: [...starred],
    username,
    role
  };
}

export const actions = {
  toggleStar: async ({ request, locals }) => {
    if (!locals.username) return fail(401, { error: 'Sign in to star a project.' });
    const form = await request.formData();
    const slug = String(form.get('slug') ?? '').trim();
    const starred = String(form.get('starred') ?? 'true') === 'true';
    if (!slug) return fail(400, { error: 'Choose a project.' });
    try {
      await setProjectStar(locals.username, slug, starred);
    } catch (error) {
      console.error('[project star] toggle failed', error);
      return fail(503, { error: 'The database is temporarily unavailable. Try again shortly.' });
    }
    return { message: starred ? 'Board starred.' : 'Board unstarred.' };
  },
  logout: async ({ cookies }) => {
    await endSession(cookies.get(sessionCookie));
    cookies.delete(sessionCookie, { path: '/' });
    return { message: 'Signed out.' };
  },
  logoutEverywhere: async ({ cookies, locals }) => {
    if (!locals.username) return fail(401, { errors: ['Sign in first.'] });
    // Revokes every session for this account, including the one making this
    // request — a captured or leaked token from another device stops working
    // on its next request rather than riding out its 7-day signed expiry.
    await revokeAllSessionsForUser(locals.username);
    cookies.delete(sessionCookie, { path: '/' });
    throw redirect(303, '/login');
  }
};
