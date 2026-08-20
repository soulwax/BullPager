import { fail, redirect } from '@sveltejs/kit';
import { getBoardProject, listStarredProjectSlugs, listWikiPages, recordProjectActivity, saveWikiPage } from '$lib/server/persistence';
import { loadProjectChrome } from '$lib/server/projectChrome';
import { missingPages, wikiExcerpt } from '$lib/wikiLinks';
import { isValidPageId, pageIdFor } from '$lib/wikiFiles';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');

export async function load({ params, locals, url }) {
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/');
  const username = locals.username ?? '';
  const [pages, starred, chrome] = await Promise.all([
    listWikiPages(params.slug),
    listStarredProjectSlugs(username),
    loadProjectChrome(params.slug)
  ]);
  return {
    project,
    // The index shows an excerpt rather than the body: a wiki with ten long
    // pages should still be one screen you can scan.
    pages: pages.map((page) => ({ ...page, excerpt: wikiExcerpt(page.body) })),
    // What the wiki says should exist but nobody has written yet.
    wanted: missingPages(pages.map((page) => ({ slug: page.pageId, title: page.title, body: page.body }))),
    canEdit: canEdit(locals.role),
    username,
    starred: starred.has(params.slug),
    // A red link arrives here with `?new=Title` so the title is pre-filled.
    newTitle: url.searchParams.get('new') ?? '',
    ...chrome
  };
}

export const actions = {
  create: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to write wiki pages.' });
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    if (title.length < 2 || title.length > 120) return fail(400, { error: 'Give the page a title of 2–120 characters.', title });
    // A title may carry a folder — "Scaffolding/Pages" nests the file under
    // wiki/scaffolding/pages.md — because the store is a real file tree.
    const pageId = pageIdFor(title);
    if (!isValidPageId(pageId)) return fail(400, { error: 'That title has no letters or numbers to make a file name from.', title });
    const existing = await listWikiPages(params.slug);
    if (existing.some((page) => page.pageId === pageId)) {
      // Not an error worth a message: the page they asked for already exists,
      // so send them to it rather than making them find it themselves.
      throw redirect(303, `/projects/${params.slug}/wiki/${pageId}`);
    }
    try {
      await saveWikiPage({
        projectSlug: params.slug,
        pageId,
        title,
        body: String(form.get('body') ?? ''),
        editor: locals.username || 'unknown',
        summary: 'Created the page'
      });
      await recordProjectActivity({
        projectSlug: params.slug,
        actor: locals.username || 'unknown',
        action: 'created',
        cardId: '',
        summary: `Created the wiki page “${title}” (wiki/${pageId}.md).`
      });
    } catch (error) {
      console.error('[wiki] create failed', error);
      return fail(503, { error: 'The database is temporarily unavailable. The page was not created.', title });
    }
    throw redirect(303, `/projects/${params.slug}/wiki/${pageId}`);
  }
};
