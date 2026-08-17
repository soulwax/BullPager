import { fail, redirect } from '@sveltejs/kit';
import { getBoardProject, loadBoardSettings, saveBoardSettings } from '$lib/server/persistence';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');

export async function load({ params, locals, url }) {
  if (!canEdit(locals.role)) throw redirect(303, '/');
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/settings');
  const settings = await loadBoardSettings();
  const prefix = `project_${params.slug}_`;
  return { slug: params.slug, project, prefix, created: url.searchParams.get('created') === '1', settings: Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith(prefix))) };
}

export const actions = {
  default: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Project editor access is required.' });
    const project = await getBoardProject(params.slug);
    if (!project) return fail(404, { error: 'Project not found.' });
    const form = await request.formData();
    const prefix = `project_${params.slug}_`;
    const key = String(form.get('workflowKey') ?? '').trim();
    const cadence = String(form.get('cadence') ?? 'weekly');
    const visibility = String(form.get('visibility') ?? 'private');
    const boardTheme = String(form.get('boardTheme') ?? 'midnight');
    const cardDensity = String(form.get('cardDensity') ?? 'comfortable');
    const showOutcomes = form.get('showOutcomes') === 'on' ? 'true' : 'false';
    const laneStyle = String(form.get('laneStyle') ?? 'scroll');
    const lanes = String(form.get('lanes') ?? '').split(',').map((lane) => lane.trim()).filter(Boolean);
    if (key.length > 120 || !['weekly', 'biweekly', 'monthly'].includes(cadence) || !['private', 'shared'].includes(visibility) || !['midnight', 'ocean', 'light'].includes(boardTheme) || !['comfortable', 'compact'].includes(cardDensity) || !['scroll', 'wrap'].includes(laneStyle) || lanes.length < 2 || lanes.length > 8 || lanes.some((lane) => lane.length > 48)) return fail(400, { error: 'Choose valid project settings.' });
    await saveBoardSettings({ [`${prefix}workflow_key`]: key, [`${prefix}cadence`]: cadence, [`${prefix}visibility`]: visibility, [`${prefix}theme`]: boardTheme, [`${prefix}density`]: cardDensity, [`${prefix}show_outcomes`]: showOutcomes, [`${prefix}lane_style`]: laneStyle, [`${prefix}lanes`]: JSON.stringify(lanes) });
    return { message: 'Project settings saved.' };
  }
};
