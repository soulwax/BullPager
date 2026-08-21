import { fail, redirect } from '@sveltejs/kit';
import { createBoardProject, getBoardProject, loadBoardSettings, saveBoardSettings, saveWikiPage } from '$lib/server/persistence';
import { wikiSeedFor } from '$lib/wikiScaffold';
import { projectTemplates, templateById } from '$lib/projectTemplates';

function canCreate(role: string | undefined) {
  return ['superadmin', 'admin', 'editor'].includes(role ?? '');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function load({ locals }) {
  if (!canCreate(locals.role)) throw redirect(303, '/');
  return { templates: projectTemplates };
}

export const actions = {
  default: async ({ request, locals }) => {
    if (!canCreate(locals.role)) return fail(403, { error: 'Project creation is available to editors and administrators.' });
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const requestedSlug = String(form.get('slug') ?? '').trim();
    const templateId = String(form.get('template') ?? 'software-delivery');
    if (!projectTemplates.some((item) => item.id === templateId)) return fail(400, { error: 'Choose one of the available project templates.', name, slug: requestedSlug, templateId });
    const template = templateById(templateId);
    const slug = slugify(requestedSlug || name);
    if (name.length < 2 || name.length > 80) return fail(400, { error: 'Project name must be 2–80 characters.', name, slug: requestedSlug, templateId });
    if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(slug)) return fail(400, { error: 'Use a short URL slug with lowercase letters, numbers, and hyphens.', name, slug, templateId });
    if (await getBoardProject(slug)) return fail(409, { error: 'That project slug is already in use. Choose another one.', name, slug, templateId });

    const settings = await loadBoardSettings();
    const owner = locals.username ?? 'superadmin';
    const visibility = settings.project_visibility === 'shared' ? 'shared' : 'private';
    const prefix = `project_${slug}_`;
    try {
      await createBoardProject({ slug, name, owner, visibility });
      await saveBoardSettings({
        [`${prefix}template`]: template.id,
        [`${prefix}workflow_key`]: '',
        [`${prefix}cadence`]: template.cadence,
        [`${prefix}visibility`]: visibility,
        [`${prefix}theme`]: template.theme,
        [`${prefix}background`]: 'none',
        [`${prefix}glass_intensity`]: '38',
        [`${prefix}density`]: 'comfortable',
        [`${prefix}show_outcomes`]: 'true',
        [`${prefix}lane_style`]: 'scroll',
        [`${prefix}lanes`]: JSON.stringify(template.lanes)
      });
    } catch {
      return fail(409, { error: 'The project could not be created. Try a different slug.', name, slug, templateId });
    }

    // Seed the wiki after the project exists, and never let it fail the
    // creation: a project with an empty wiki is a working project, whereas
    // rejecting the whole creation because a starter page did not write would
    // be a bad trade. Sequential rather than parallel — the file store is
    // unique on (slug, path) and these share a project.
    for (const page of wikiSeedFor(template.id, name)) {
      try {
        await saveWikiPage({
          projectSlug: slug,
          pageId: page.id,
          title: page.title,
          body: page.body,
          editor: owner,
          summary: 'Created with the project',
          pinned: page.pinned
        });
      } catch {
        break;
      }
    }

    throw redirect(303, `/projects/${slug}?created=1`);
  }
};
