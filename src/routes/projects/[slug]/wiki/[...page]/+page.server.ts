import { fail, redirect } from '@sveltejs/kit';
import {
  deleteWikiPage,
  getBoardProject,
  getWikiPage,
  listStarredProjectSlugs,
  listWikiPages,
  listWikiRevisions,
  recordProjectActivity,
  saveWikiPage
} from '$lib/server/persistence';
import { loadProjectChrome } from '$lib/server/projectChrome';
import { backlinksFor, parseWikiLinks } from '$lib/wikiLinks';
import { isValidPageId } from '$lib/wikiFiles';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');

export async function load({ params, locals }) {
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/');
  const page = isValidPageId(params.page) ? await getWikiPage(params.slug, params.page) : null;
  // A page that does not exist is not an error — it is the wiki's invitation
  // to write it. Send the reader to the composer with the title filled in.
  if (!page) throw redirect(303, `/projects/${params.slug}/wiki?new=${encodeURIComponent(params.page)}`);

  const [pages, revisions, starred, chrome] = await Promise.all([
    listWikiPages(params.slug),
    listWikiRevisions(page.path),
    listStarredProjectSlugs(locals.username ?? ''),
    loadProjectChrome(params.slug)
  ]);

  return {
    project,
    page,
    // Which slugs exist decides whether each link renders live or missing.
    known: pages.map((entry) => entry.pageId),
    outgoing: parseWikiLinks(page.body),
    backlinks: backlinksFor(
      pages.map((entry) => ({ slug: entry.pageId, title: entry.title, body: entry.body })),
      page.pageId
    ).map((entry) => ({ pageId: entry.slug, title: entry.title })),
    revisions,
    canEdit: canEdit(locals.role),
    username: locals.username ?? '',
    starred: starred.has(params.slug),
    ...chrome
  };
}

export const actions = {
  save: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit wiki pages.' });
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const body = String(form.get('body') ?? '');
    if (title.length < 2 || title.length > 120) return fail(400, { error: 'Give the page a title of 2–120 characters.' });
    if (body.length > 200_000) return fail(413, { error: 'Keep a wiki page under 200,000 characters; split it instead.' });
    const existing = await getWikiPage(params.slug, params.page);
    if (!existing) return fail(404, { error: 'That page no longer exists.' });
    // An edit that changes nothing should not add a revision that says so.
    if (existing.title === title && existing.body === body) return { message: 'No changes to save.' };
    try {
      await saveWikiPage({
        projectSlug: params.slug,
        pageId: params.page,
        title,
        body,
        editor: locals.username || 'unknown',
        summary: String(form.get('summary') ?? '').trim()
      });
    } catch (error) {
      console.error('[wiki] save failed', error);
      return fail(503, { error: 'The database is temporarily unavailable. Your edit was not saved.' });
    }
    return { message: 'Page saved.' };
  },

  togglePin: async ({ locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required.' });
    const existing = await getWikiPage(params.slug, params.page);
    if (!existing) return fail(404, { error: 'That page no longer exists.' });
    try {
      await saveWikiPage({
        projectSlug: params.slug,
        pageId: params.page,
        title: existing.title,
        body: existing.body,
        editor: locals.username || 'unknown',
        pinned: !existing.pinned,
        summary: existing.pinned ? 'Unpinned the page' : 'Pinned the page'
      });
    } catch (error) {
      console.error('[wiki] pin failed', error);
      return fail(503, { error: 'The database is temporarily unavailable.' });
    }
    return { message: existing.pinned ? 'Page unpinned.' : 'Page pinned.' };
  },

  remove: async ({ locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required.' });
    const existing = await getWikiPage(params.slug, params.page);
    if (!existing) throw redirect(303, `/projects/${params.slug}/wiki`);
    try {
      await deleteWikiPage(params.slug, params.page);
      await recordProjectActivity({
        projectSlug: params.slug,
        actor: locals.username || 'unknown',
        action: 'deleted',
        cardId: '',
        summary: `Deleted the wiki page “${existing.title}”.`
      });
    } catch (error) {
      console.error('[wiki] delete failed', error);
      return fail(503, { error: 'The database is temporarily unavailable. The page was not deleted.' });
    }
    throw redirect(303, `/projects/${params.slug}/wiki`);
  }
};
