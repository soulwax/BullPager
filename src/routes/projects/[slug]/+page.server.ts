import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { createProjectCard, deleteProjectCard, getBoardProject, listProjectActivity, listProjectCards, loadBoardSettings, loadProjectViewState, recordProjectActivity, saveProjectViewState, updateProjectCard } from '$lib/server/persistence';
import { lanesFromSettings, mergeProjectLanes, projectPrefix, sanitizeProjectViewState, validProjectCardInput } from '$lib/projectState';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');

export async function load({ params, url, locals }) {
  if (params.slug === 'unity-plan') throw redirect(303, '/');
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/settings');
  const allSettings = await loadBoardSettings();
  const prefix = projectPrefix(params.slug);
  const settings = Object.fromEntries(Object.entries(allSettings).filter(([key]) => key.startsWith(prefix)));
  const username = locals.username ?? 'anonymous';
  const cards = await listProjectCards(params.slug);
  const configuredLanes = lanesFromSettings(settings, prefix);
  return { project, prefix, settings, lanes: mergeProjectLanes(configuredLanes, cards), cards, activity: await listProjectActivity(params.slug), viewState: await loadProjectViewState(params.slug, username), canEdit: canEdit(locals.role), created: url.searchParams.get('created') === '1' };
}

function readCard(form: FormData, projectSlug: string, fallbackId?: string) {
  const title = String(form.get('title') ?? '').trim();
  const details = String(form.get('details') ?? '').trim();
  const lane = String(form.get('lane') ?? '').trim();
  const owner = String(form.get('owner') ?? '').trim();
  const priority = String(form.get('priority') ?? 'normal') as 'low' | 'normal' | 'high' | 'urgent';
  const dueDate = String(form.get('dueDate') ?? '').trim();
  return { id: fallbackId ?? `card-${Date.now()}-${randomBytes(6).toString('hex')}`, projectSlug, title, details, lane, owner, priority, dueDate: dueDate || null };
}

async function validLanes(slug: string) {
  const allSettings = await loadBoardSettings();
  const prefix = projectPrefix(slug);
  const configured = lanesFromSettings(allSettings, prefix);
  const existing = (await listProjectCards(slug)).map((card) => card.lane);
  return [...configured, ...existing.filter((lane, index) => !configured.includes(lane) && existing.indexOf(lane) === index)];
}

export const actions = {
  createCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change project cards.' });
    const card = readCard(await request.formData(), params.slug);
    const lanes = await validLanes(params.slug);
    if (!validProjectCardInput(card, lanes)) return fail(400, { error: 'Add a title and choose valid lane, priority, and due-date values.' });
    const owner = card.owner.slice(0, 120) || locals.username || 'unassigned';
    await createProjectCard({ ...card, owner });
    await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || owner, action: 'created', cardId: card.id, summary: `Created “${card.title}” in ${card.lane}.` });
    return { message: 'Card saved.' };
  },
  updateCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change project cards.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const card = readCard(form, params.slug, id);
    const lanes = await validLanes(params.slug);
    if (!id || !validProjectCardInput(card, lanes)) return fail(400, { error: 'Choose valid card values.' });
    const owner = card.owner.slice(0, 120) || locals.username || 'unassigned';
    await updateProjectCard({ ...card, owner });
    await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || owner, action: 'updated', cardId: card.id, summary: `Updated “${card.title}”.` });
    return { message: 'Card updated.' };
  },
  deleteCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change project cards.' });
    const id = String((await request.formData()).get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose a card.' });
    await deleteProjectCard(params.slug, id);
    await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'deleted', cardId: id, summary: 'Deleted a card.' });
    return { message: 'Card deleted.' };
  },
  saveView: async ({ request, locals, params }) => {
    if (!locals.username) return fail(401, { error: 'Sign in to save your board view.' });
    const form = await request.formData();
    const density = String(form.get('density') ?? 'comfortable');
    let collapsed: Record<string, boolean> = {};
    try {
      const parsed = JSON.parse(String(form.get('collapsed') ?? '{}'));
      if (parsed && typeof parsed === 'object') collapsed = sanitizeProjectViewState({ collapsed: parsed }).collapsed ?? {};
    } catch { /* ignore malformed view state */ }
    if (!['comfortable', 'compact'].includes(density)) return fail(400, { error: 'Choose a valid board density.' });
    await saveProjectViewState(params.slug, locals.username, { density: density as 'comfortable' | 'compact', collapsed });
    return { message: 'View saved.' };
  }
};
