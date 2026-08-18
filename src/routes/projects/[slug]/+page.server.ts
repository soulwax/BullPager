import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { createCardAttachment, createProjectCard, createProjectComment, createProjectTag, deleteCardAttachment, deleteProjectCard, deleteProjectComment, deleteProjectTag, getBoardProject, listBoardUsers, listCardAttachments, listProjectActivity, listProjectCards, listProjectComments, listProjectTags, loadBoardSettings, loadProjectViewState, persistenceEnabled, recordProjectActivity, reorderProjectCard, saveBoardSettings, saveProjectViewState, setProjectCardOrder, setProjectCardWatching, syncUnityPlannerCards, updateProjectCard } from '$lib/server/persistence';
import { isSourceOwnedProject, lanesFromSettings, mergeProjectLanes, projectPrefix, sanitizeProjectViewState, validProjectCardInput } from '$lib/projectState';
import { loadPlan } from '$lib/server/plan';
import type { ProjectCard } from '$lib/types';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');
const persistenceFailure = (message: string, error: unknown) => {
  console.error(`[project persistence] ${message}`, error);
  return fail(503, { error: 'The database is temporarily unavailable. Your change was not lost; try again shortly.' });
};
const sourceLockedError = () => fail(403, { error: 'This board mirrors UNITY_PLAN.md. Edit the packet in the plan file, not the card — lane, dates, comments, attachments, and checklist ticks stay editable here.' });

export async function load({ params, url, locals }) {
  if (params.slug === 'unity-plan' && persistenceEnabled()) {
    const plan = await loadPlan();
    if (plan.valid && plan.packets.length) {
      try {
        await syncUnityPlannerCards(plan.packets, { sourceDigest: plan.sourceDigest, actor: locals.username || 'planner' });
      } catch (error) {
        // The board remains readable if a transient sync fails. The next board
        // visit resumes the idempotent mirror.
        console.error('[unity board sync] unable to mirror implementation packets', error);
      }
    }
  }
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/settings');
  const allSettings = await loadBoardSettings();
  const prefix = projectPrefix(params.slug);
  const settings = Object.fromEntries(Object.entries(allSettings).filter(([key]) => key.startsWith(prefix)));
  const username = locals.username ?? 'anonymous';
  const cards = await listProjectCards(params.slug, username);
  const tags = await listProjectTags(params.slug);
  const configuredLanes = lanesFromSettings(settings, prefix);
  const openCard = url.searchParams.get('card');
  return { project, prefix, settings, sourceOwned: isSourceOwnedProject(settings, prefix), lanes: mergeProjectLanes(configuredLanes, cards), cards, tags, members: await listBoardUsers(), activity: await listProjectActivity(params.slug), comments: await listProjectComments(params.slug), attachments: await listCardAttachments(params.slug), viewState: await loadProjectViewState(params.slug, username), canEdit: canEdit(locals.role), username, role: locals.role ?? '', openCard, created: url.searchParams.get('created') === '1' };
}

function readCard(form: FormData, projectSlug: string, fallbackId?: string) {
  const title = String(form.get('title') ?? '').trim();
  const details = String(form.get('details') ?? '').trim();
  const lane = String(form.get('lane') ?? '').trim();
  const owner = String(form.get('owner') ?? '').trim();
  const priority = String(form.get('priority') ?? 'normal') as 'low' | 'normal' | 'high' | 'urgent';
  const dueDate = String(form.get('dueDate') ?? '').trim();
  const dueComplete = String(form.get('dueComplete') ?? '') === 'true';
  const startDate = String(form.get('startDate') ?? '').trim();
  const coverColor = String(form.get('coverColor') ?? '').trim();
  const archived = form.has('archived') ? String(form.get('archived')) === 'true' : String(form.get('cardArchived') ?? 'false') === 'true';
  const tagIds = form.getAll('tagId').map((value) => String(value)).filter(Boolean).slice(0, 12);
  const itemIds = form.getAll('checkItemId').map((value) => String(value).trim());
  const itemTexts = form.getAll('checkItemText').map((value) => String(value).trim());
  const doneIds = new Set(form.getAll('checkItemDone').map((value) => String(value)));
  const checklist = itemIds.map((id, index) => ({ id: id === 'new' ? `check-${Date.now()}-${index}-${randomBytes(3).toString('hex')}` : id.slice(0, 80), text: (itemTexts[index] ?? '').slice(0, 240), done: doneIds.has(id) })).filter((item) => item.id && item.text).slice(0, 40);
  return { id: fallbackId ?? `card-${Date.now()}-${randomBytes(6).toString('hex')}`, projectSlug, title, details, lane, owner, priority, dueDate: dueDate || null, dueComplete, startDate: startDate || null, archived, checklist, coverColor, tagIds };
}

/** The six source-owned fields (BUILD_MASTERPLAN.md §C.3) fall back to the
 * existing card's values; a checklist item's `done` still comes from the
 * submitted form so ticking a handle off never requires unlocking the card. */
function applySourceLock(card: ReturnType<typeof readCard>, existing: ProjectCard) {
  const doneById = new Map(card.checklist.map((item) => [item.id, item.done]));
  return { ...card, title: existing.title, details: existing.details, owner: existing.owner, priority: existing.priority, coverColor: existing.coverColor, checklist: existing.checklist.map((item) => ({ ...item, done: doneById.get(item.id) ?? item.done })) };
}

async function validLanes(slug: string) {
  const allSettings = await loadBoardSettings();
  const prefix = projectPrefix(slug);
  const configured = lanesFromSettings(allSettings, prefix);
  const existing = (await listProjectCards(slug)).map((card) => card.lane);
  return [...configured, ...existing.filter((lane, index) => !configured.includes(lane) && existing.indexOf(lane) === index)];
}

async function projectIsSourceOwned(slug: string) {
  return isSourceOwnedProject(await loadBoardSettings(), projectPrefix(slug));
}

export const actions = {
  createCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change project cards.' });
    if (await projectIsSourceOwned(params.slug)) return sourceLockedError();
    const card = readCard(await request.formData(), params.slug);
    const lanes = await validLanes(params.slug);
    if (!validProjectCardInput(card, lanes) || (card.coverColor && !/^#[0-9a-f]{6}$/i.test(card.coverColor))) return fail(400, { error: 'Add a title and choose valid lane, priority, due-date, and cover values.' });
    const owner = card.owner.slice(0, 120) || locals.username || 'unassigned';
    try {
      await createProjectCard({ ...card, owner });
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || owner, action: 'created', cardId: card.id, summary: `Created “${card.title}” in ${card.lane}.` });
    } catch (error) {
      return persistenceFailure('create card failed', error);
    }
    return { message: 'Card saved.' };
  },
  updateCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change project cards.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    let card = readCard(form, params.slug, id);
    const lanes = await validLanes(params.slug);
    if (!id || !validProjectCardInput(card, lanes) || (card.coverColor && !/^#[0-9a-f]{6}$/i.test(card.coverColor))) return fail(400, { error: 'Choose valid card values.' });
    const existing = (await listProjectCards(params.slug)).find((item) => item.id === id);
    if (!existing) return fail(404, { error: 'That card no longer exists. Refresh the board.' });
    if (await projectIsSourceOwned(params.slug)) card = applySourceLock(card, existing);
    const owner = card.owner.slice(0, 120) || locals.username || 'unassigned';
    try {
      await updateProjectCard({ ...card, owner });
      if (existing.lane !== card.lane) await reorderProjectCard(params.slug, id, card.lane);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || owner, action: 'updated', cardId: card.id, summary: `Updated “${card.title}”.` });
    } catch (error) {
      return persistenceFailure('update card failed', error);
    }
    return { message: 'Card updated.' };
  },
  moveCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to move project cards.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const lane = String(form.get('lane') ?? '').trim();
    const card = (await listProjectCards(params.slug)).find((item) => item.id === id);
    const lanes = await validLanes(params.slug);
    if (!card || !lanes.includes(lane)) return fail(400, { error: 'Choose a valid card and destination lane.' });
    if (card.lane === lane) return { message: 'Card is already in that lane.' };
    try {
      await updateProjectCard({ ...card, lane, tagIds: (card.tags ?? []).map((tag) => tag.id) });
      await reorderProjectCard(params.slug, id, lane);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || card.owner || 'unassigned', action: 'updated', cardId: card.id, summary: `Moved “${card.title}” to ${lane}.` });
    } catch (error) {
      return persistenceFailure('move card failed', error);
    }
    return { message: 'Card moved.' };
  },
  reorderCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to reorder project cards.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const lane = String(form.get('lane') ?? '').trim();
    const beforeId = String(form.get('beforeId') ?? '').trim();
    const lanes = await validLanes(params.slug);
    if (!id || !lanes.includes(lane)) return fail(400, { error: 'Choose a valid card and destination lane.' });
    try {
      await reorderProjectCard(params.slug, id, lane, beforeId);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: id, summary: `Reordered a card in ${lane}.` });
    } catch (error) {
      return persistenceFailure('reorder card failed', error);
    }
    return { message: 'Card order saved.' };
  },
  saveOrder: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to reorder project cards.' });
    const form = await request.formData();
    let order: Array<{ id: string; lane: string; position: number }>;
    try {
      const parsed = JSON.parse(String(form.get('order') ?? '[]'));
      if (!Array.isArray(parsed) || parsed.length > 1000) throw new Error('Invalid order.');
      order = parsed.map((item) => ({ id: String(item?.id ?? '').trim(), lane: String(item?.lane ?? '').trim(), position: Number(item?.position) }));
    } catch {
      return fail(400, { error: 'The card order could not be read.' });
    }
    const lanes = await validLanes(params.slug);
    const current = await listProjectCards(params.slug);
    const currentIds = new Set(current.map((card) => card.id));
    if (order.length !== current.length || order.some((item) => !currentIds.has(item.id) || !lanes.includes(item.lane))) return fail(409, { error: 'The board changed elsewhere. Refresh and try the move again.' });
    try {
      await setProjectCardOrder(params.slug, order);
      await recordProjectActivity({ projectSlug: params.slug, cardId: order[0]?.id ?? '', actor: locals.username || 'unknown', action: 'updated', summary: 'Reordered cards on the board.' });
    } catch (error) {
      return persistenceFailure('save card order failed', error);
    }
    return { message: 'Card order saved.' };
  },
  archiveCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to archive project cards.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const archived = String(form.get('archived') ?? 'true') === 'true';
    const card = (await listProjectCards(params.slug)).find((item) => item.id === id);
    if (!card) return fail(400, { error: 'Choose a valid card.' });
    try {
      await updateProjectCard({ ...card, archived });
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: id, summary: archived ? `Archived “${card.title}”.` : `Restored “${card.title}”.` });
    } catch (error) {
      return persistenceFailure('archive card failed', error);
    }
    return { message: archived ? 'Card archived.' : 'Card restored.' };
  },
  duplicateCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to duplicate project cards.' });
    if (await projectIsSourceOwned(params.slug)) return sourceLockedError();
    const id = String((await request.formData()).get('id') ?? '').trim();
    const source = (await listProjectCards(params.slug)).find((item) => item.id === id);
    if (!source) return fail(400, { error: 'Choose a valid card.' });
    const copy = { id: `card-${Date.now()}-${randomBytes(6).toString('hex')}`, projectSlug: params.slug, title: `Copy of ${source.title}`, details: source.details, lane: source.lane, owner: source.owner, priority: source.priority, dueDate: source.dueDate, dueComplete: false, startDate: source.startDate, archived: false, checklist: source.checklist.map((item, index) => ({ ...item, id: `check-${Date.now()}-${index}-${randomBytes(3).toString('hex')}`, done: false })), coverColor: source.coverColor, tagIds: source.tags.map((tag) => tag.id) };
    try {
      await createProjectCard(copy);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'created', cardId: copy.id, summary: `Duplicated “${source.title}”.` });
    } catch (error) {
      return persistenceFailure('duplicate card failed', error);
    }
    return { message: 'Card duplicated.' };
  },
  deleteCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change project cards.' });
    if (await projectIsSourceOwned(params.slug)) return sourceLockedError();
    const id = String((await request.formData()).get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose a card.' });
    try {
      await deleteProjectCard(params.slug, id);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'deleted', cardId: id, summary: 'Deleted a card.' });
    } catch (error) {
      return persistenceFailure('delete card failed', error);
    }
    return { message: 'Card deleted.' };
  },
  toggleWatch: async ({ request, locals, params }) => {
    if (!locals.username) return fail(401, { error: 'Sign in to watch project cards.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const watching = String(form.get('watching') ?? 'true') === 'true';
    const card = (await listProjectCards(params.slug)).find((item) => item.id === id);
    if (!card) return fail(400, { error: 'Choose a valid card.' });
    try { await setProjectCardWatching(params.slug, id, locals.username, watching); } catch (error) { return persistenceFailure('toggle card watch failed', error); }
    return { message: watching ? 'Card is now being watched.' : 'Card watch removed.' };
  },
  createComment: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to comment on project cards.' });
    const form = await request.formData();
    const cardId = String(form.get('cardId') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();
    const card = (await listProjectCards(params.slug)).find((item) => item.id === cardId);
    if (!card) return fail(400, { error: 'Choose a valid card.' });
    if (!body) return fail(400, { error: 'Write a comment before saving.' });
    try {
      await createProjectComment(params.slug, cardId, locals.username || card.owner || 'unknown', body);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId, summary: `Commented on “${card.title}”.` });
    } catch (error) {
      return persistenceFailure('create comment failed', error);
    }
    return { message: 'Comment saved.' };
  },
  deleteComment: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to remove comments.' });
    const id = String((await request.formData()).get('id') ?? '').trim();
    if (!/^\d+$/.test(id)) return fail(400, { error: 'Choose a valid comment.' });
    try {
      await deleteProjectComment(params.slug, id, locals.username || '', ['superadmin', 'admin'].includes(locals.role ?? ''));
    } catch (error) {
      return persistenceFailure('delete comment failed', error);
    }
    return { message: 'Comment removed.' };
  },
  createTag: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to create project tags.' });
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const color = String(form.get('color') ?? '');
    if (name.length < 1 || name.length > 32) return fail(400, { error: 'Tag names must be 1–32 characters.' });
    try {
      await createProjectTag(params.slug, name, color);
    } catch (error) {
      if (error instanceof Error && error.message === 'TAG_EXISTS') return fail(409, { error: 'A tag with that name already exists in this project.' });
      return persistenceFailure('create tag failed', error);
    }
    return { message: 'Tag created.' };
  },
  deleteTag: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to remove project tags.' });
    const id = String((await request.formData()).get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose a tag.' });
    try {
      await deleteProjectTag(params.slug, id);
    } catch (error) {
      return persistenceFailure('delete tag failed', error);
    }
    return { message: 'Tag removed.' };
  },
  saveView: async ({ request, locals, params }) => {
    if (!locals.username) return fail(401, { error: 'Sign in to save your board view.' });
    const form = await request.formData();
    const density = String(form.get('density') ?? 'comfortable');
    const query = String(form.get('query') ?? '').trim().slice(0, 120);
    const priority = String(form.get('priority') ?? 'all');
    const tag = String(form.get('tag') ?? 'all').trim().slice(0, 120);
    const assignee = String(form.get('assignee') ?? 'all').trim().slice(0, 120);
    const showArchived = String(form.get('showArchived') ?? 'false') === 'true';
    let collapsed: Record<string, boolean> = {};
    try {
      const parsed = JSON.parse(String(form.get('collapsed') ?? '{}'));
      if (parsed && typeof parsed === 'object') collapsed = sanitizeProjectViewState({ collapsed: parsed }).collapsed ?? {};
    } catch { /* ignore malformed view state */ }
    if (!['comfortable', 'compact'].includes(density)) return fail(400, { error: 'Choose a valid board density.' });
    if (!['all', 'low', 'normal', 'high', 'urgent'].includes(priority)) return fail(400, { error: 'Choose a valid priority filter.' });
    try {
      await saveProjectViewState(params.slug, locals.username, { density: density as 'comfortable' | 'compact', collapsed, query, priority: priority as 'all' | 'low' | 'normal' | 'high' | 'urgent', tag, assignee, showArchived });
    } catch (error) {
      return persistenceFailure('save view failed', error);
    }
    return { message: 'View saved.' };
  },
  attachFile: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to attach files to project cards.' });
    const form = await request.formData();
    const cardId = String(form.get('cardId') ?? '').trim();
    const name = String(form.get('name') ?? '').trim();
    const url = String(form.get('url') ?? '').trim();
    const mimeType = String(form.get('mimeType') ?? 'application/octet-stream').trim();
    const size = Number(form.get('size') ?? 0);
    const card = (await listProjectCards(params.slug)).find((item) => item.id === cardId);
    if (!card || !name || !url.startsWith(`/projects/${params.slug}/files/raw?path=`)) return fail(400, { error: 'Choose a valid card and an uploaded file.' });
    try {
      await createCardAttachment({ id: `attach-${Date.now()}-${randomBytes(6).toString('hex')}`, projectSlug: params.slug, cardId, name, url, mimeType, size: Number.isFinite(size) ? Math.max(0, Math.round(size)) : 0, createdBy: locals.username || 'unknown' });
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId, summary: `Attached ${name} to “${card.title}”.` });
    } catch (error) {
      return persistenceFailure('attach file failed', error);
    }
    return { message: 'File attached.' };
  },
  deleteAttachment: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to remove card attachments.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const cardId = String(form.get('cardId') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose an attachment.' });
    try {
      await deleteCardAttachment(params.slug, id);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId, summary: 'Removed a card attachment.' });
    } catch (error) {
      return persistenceFailure('delete attachment failed', error);
    }
    return { message: 'Attachment removed.' };
  },
  reorderLanes: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to reorder lists.' });
    const form = await request.formData();
    let lanes: string[];
    try {
      const parsed = JSON.parse(String(form.get('lanes') ?? '[]'));
      if (!Array.isArray(parsed)) throw new Error();
      lanes = parsed.map((value) => String(value).trim()).filter(Boolean);
    } catch {
      return fail(400, { error: 'The list order could not be read.' });
    }
    const current = await validLanes(params.slug);
    if (lanes.length !== current.length || new Set(lanes).size !== lanes.length || lanes.some((lane) => !current.includes(lane))) return fail(409, { error: 'The board changed elsewhere. Refresh and try reordering again.' });
    try {
      await saveBoardSettings({ [`${projectPrefix(params.slug)}lanes`]: JSON.stringify(lanes) });
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: '', summary: 'Reordered the board lists.' });
    } catch (error) {
      return persistenceFailure('reorder lanes failed', error);
    }
    return { message: 'List order saved.' };
  }
};
