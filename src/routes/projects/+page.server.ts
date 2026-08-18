import { fail } from '@sveltejs/kit';
import { listBoardProjects, listStarredProjectSlugs, setProjectStar } from '$lib/server/persistence';

export async function load({ locals }) {
  const username = locals.username ?? '';
  const [projects, starred] = await Promise.all([listBoardProjects(), listStarredProjectSlugs(username)]);
  const ordered = [...projects].sort((a, b) => Number(starred.has(b.slug)) - Number(starred.has(a.slug)) || a.name.localeCompare(b.name));
  return { projects: ordered, starred: [...starred], username, role: locals.role ?? '' };
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
  }
};
