import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { archiveAllCardsInLane, createCardAttachment, createProjectCard, createProjectComment, createProjectTag, deleteCardAttachment, deleteProjectCard, deleteProjectComment, deleteProjectTag, getBoardProject, listBoardUsers, listCardAttachments, listProjectActivity, listProjectCards, listProjectComments, listProjectTags, listStarredProjectSlugs, loadBoardSettings, loadProjectViewState, moveAllCardsInLane, persistenceEnabled, recordProjectActivity, renameProjectLanes, reorderProjectCard, saveBoardSettings, saveProjectViewState, setProjectCardOrder, setProjectCardWatching, setProjectStar, syncUnityPlannerCards, updateProjectCard, updateProjectName } from '$lib/server/persistence';
import { isSourceOwnedProject, lanesFromSettings, mergeProjectLanes, projectPrefix, sanitizeProjectViewState, validProjectCardInput } from '$lib/projectState';
import { loadPlan } from '$lib/server/plan';
import { appearanceToSettings, normalizeAppearance } from '$lib/boardAppearance';
import { projectBackgrounds } from '$lib/projectBackgrounds';
import { runAutomationEvent, sanitizeAutomationRules, type AutomationCardState, type AutomationEvent } from '$lib/automation';
import type { CardTemplate, ProjectCard } from '$lib/types';

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
  const starred = await listStarredProjectSlugs(locals.username ?? '');
  let wipLimits: Record<string, number> = {};
  try { wipLimits = JSON.parse(settings[`${prefix}wip_limits`] ?? '{}'); } catch { /* ignore malformed limits */ }
  let templates: Record<string, CardTemplate[]> = {};
  try { templates = JSON.parse(settings[`${prefix}templates`] ?? '{}'); } catch { /* ignore malformed templates */ }
  return { project, prefix, settings, sourceOwned: isSourceOwnedProject(settings, prefix), wipLimits, templates, starred: starred.has(params.slug), lanes: mergeProjectLanes(configuredLanes, cards), cards, tags, members: await listBoardUsers(), activity: await listProjectActivity(params.slug), comments: await listProjectComments(params.slug), attachments: await listCardAttachments(params.slug), viewState: await loadProjectViewState(params.slug, username), canEdit: canEdit(locals.role), username, role: locals.role ?? '', openCard, created: url.searchParams.get('created') === '1' };
}

/** A cover is either a hex color or the URL of one of the card's own image
 * attachments — `attachFile` already only ever stores same-project,
 * same-origin `/files/raw?path=` URLs, so accepting that exact prefix here
 * (rather than any URL) means an image cover can never point off-site. */
function validCoverColor(value: string, projectSlug: string) {
  return !value || /^#[0-9a-f]{6}$/i.test(value) || value.startsWith(`/projects/${projectSlug}/files/raw?path=`);
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

/** Templates are board config, not cards, so they live in one JSON setting
 * keyed per list — same idiom as WIP limits — rather than a new table. */
async function templatesFor(slug: string): Promise<Record<string, CardTemplate[]>> {
  const allSettings = await loadBoardSettings();
  try {
    const parsed = JSON.parse(allSettings[`${projectPrefix(slug)}templates`] ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Board automation ("Butler" in Trello's own naming) — rules stored as one
 * JSON board setting, the same idiom as templates and WIP limits. Rules are
 * re-validated against the board's *current* lanes/tags on every read, so a
 * rule left over from a deleted list or label just drops instead of
 * half-applying against something that no longer exists. */
async function automationRulesFor(slug: string) {
  const [allSettings, lanes, tags] = await Promise.all([loadBoardSettings(), validLanes(slug), listProjectTags(slug)]);
  try {
    const parsed = JSON.parse(allSettings[`${projectPrefix(slug)}automations`] ?? '[]');
    return sanitizeAutomationRules(parsed, lanes, tags.map((tag) => tag.id));
  } catch {
    return [];
  }
}

type AutomationCardInput = { id: string; projectSlug: string; title: string; details: string; owner: string; dueDate: string | null; startDate: string | null; checklist: ProjectCard['checklist']; coverColor: string; lane: string; tagIds: string[]; priority: ProjectCard['priority']; dueComplete: boolean; archived: boolean };

function toAutomationInput(card: ProjectCard, overrides: Partial<Pick<AutomationCardInput, 'lane' | 'tagIds' | 'priority' | 'dueComplete' | 'archived'>> = {}): AutomationCardInput {
  return { id: card.id, projectSlug: card.projectSlug, title: card.title, details: card.details, owner: card.owner, dueDate: card.dueDate, startDate: card.startDate, checklist: card.checklist ?? [], coverColor: card.coverColor ?? '', lane: card.lane, tagIds: (card.tags ?? []).map((tag) => tag.id), priority: card.priority, dueComplete: card.dueComplete, archived: card.archived, ...overrides };
}

/** Applies whichever rules match this event to the card that triggered it.
 * Deliberately fails soft — a hiccup here must never turn a plain card move
 * or checklist tick into a 500 for the person who made it. */
async function runAutomations(slug: string, card: AutomationCardInput, event: AutomationEvent) {
  const rules = await automationRulesFor(slug);
  if (!rules.length) return;
  const tags = await listProjectTags(slug);
  const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));
  const state: AutomationCardState = { lane: card.lane, tagIds: card.tagIds, priority: card.priority, dueComplete: card.dueComplete, archived: card.archived };
  const { state: next, ran } = runAutomationEvent(state, rules, event, tagNameById);
  if (!ran.length) return;
  try {
    await updateProjectCard({ ...card, lane: next.lane, priority: next.priority, dueComplete: next.dueComplete, archived: next.archived, tagIds: next.tagIds });
    if (next.lane !== card.lane) await reorderProjectCard(slug, card.id, next.lane);
    const summary = ran.map((entry) => `“${entry.rule.name}” — ${entry.summary.join(', ')}`).join('; ');
    await recordProjectActivity({ projectSlug: slug, actor: 'Automation', action: 'updated', cardId: card.id, summary: `Automation ran: ${summary}` });
  } catch (error) {
    console.error('[automation] failed to apply rule actions', error);
  }
}

export const actions = {
  createCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change project cards.' });
    if (await projectIsSourceOwned(params.slug)) return sourceLockedError();
    const card = readCard(await request.formData(), params.slug);
    const lanes = await validLanes(params.slug);
    if (!validProjectCardInput(card, lanes) || !validCoverColor(card.coverColor, params.slug)) return fail(400, { error: 'Add a title and choose valid lane, priority, due-date, and cover values.' });
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
    if (!id || !validProjectCardInput(card, lanes) || !validCoverColor(card.coverColor, params.slug)) return fail(400, { error: 'Choose valid card values.' });
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
    if (existing.lane !== card.lane) {
      await runAutomations(params.slug, { ...card, owner }, { type: 'enters-lane', lane: card.lane });
    } else {
      const isDone = (list: typeof card.checklist) => list.length > 0 && list.every((item) => item.done);
      if (isDone(card.checklist) && !isDone(existing.checklist)) await runAutomations(params.slug, { ...card, owner }, { type: 'checklist-completed' });
    }
    return { message: 'Card updated.' };
  },
  assignCard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to assign project cards.' });
    if (await projectIsSourceOwned(params.slug)) return sourceLockedError();
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const owner = String(form.get('owner') ?? '').trim().slice(0, 120);
    const card = (await listProjectCards(params.slug)).find((item) => item.id === id);
    if (!card) return fail(400, { error: 'Choose a valid card.' });
    try {
      await updateProjectCard({ ...card, owner, tagIds: (card.tags ?? []).map((tag) => tag.id) });
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: card.id, summary: owner ? `Assigned “${card.title}” to ${owner}.` : `Unassigned “${card.title}”.` });
    } catch (error) {
      return persistenceFailure('assign card failed', error);
    }
    return { message: owner ? 'Card assigned.' : 'Card unassigned.' };
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
    await runAutomations(params.slug, toAutomationInput(card, { lane }), { type: 'enters-lane', lane });
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
    const existing = (await listProjectCards(params.slug)).find((item) => item.id === id);
    try {
      await reorderProjectCard(params.slug, id, lane, beforeId);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: id, summary: `Reordered a card in ${lane}.` });
    } catch (error) {
      return persistenceFailure('reorder card failed', error);
    }
    // A cross-lane drag lands here too (the client posts the drop lane), so
    // this is the other place — besides the explicit moveCard action — a
    // card can "enter" a lane a rule is watching for.
    if (existing && existing.lane !== lane) await runAutomations(params.slug, toAutomationInput(existing, { lane }), { type: 'enters-lane', lane });
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
  /**
   * The quick appearance panel's save. Board-level like `background` is, so a
   * board looks the same for everyone who opens it, and gated on edit rights
   * for the same reason. `normalizeAppearance` is the validator: it clamps and
   * falls back per field rather than rejecting the whole payload, so a stale
   * client that posts an option this deployment no longer offers still saves
   * the rest of its choices instead of silently failing.
   */
  saveAppearance: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change this board\'s appearance.' });
    const project = await getBoardProject(params.slug);
    if (!project) return fail(404, { error: 'Project not found.' });
    const form = await request.formData();
    const appearance = normalizeAppearance({
      theme: form.get('theme'),
      cardTheme: form.get('cardTheme'),
      density: form.get('density'),
      radius: form.get('radius'),
      laneWidth: form.get('laneWidth'),
      textScale: form.get('textScale'),
      shadow: form.get('shadow'),
      glassIntensity: form.get('glassIntensity'),
      accent: form.get('accent'),
      highContrast: form.get('highContrast')
    });
    const background = String(form.get('background') ?? 'none');
    // A 'custom' background points at an uploaded file that only the settings
    // page can create, so it is accepted but never invented here.
    if (background !== 'custom' && !projectBackgrounds.some((option) => option.id === background)) {
      return fail(400, { error: 'Choose a valid board background.' });
    }
    const prefix = projectPrefix(params.slug);
    try {
      await saveBoardSettings({ ...appearanceToSettings(appearance, prefix), [`${prefix}background`]: background });
    } catch (error) {
      return persistenceFailure('save appearance failed', error);
    }
    return { message: 'Appearance saved.' };
  },
  saveView: async ({ request, locals, params }) => {
    if (!locals.username) return fail(401, { error: 'Sign in to save your board view.' });
    const form = await request.formData();
    const density = String(form.get('density') ?? 'comfortable');
    const labelText = String(form.get('labelText') ?? 'false') === 'true';
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
      await saveProjectViewState(params.slug, locals.username, { density: density as 'comfortable' | 'compact', labelText, collapsed, query, priority: priority as 'all' | 'low' | 'normal' | 'high' | 'urgent', tag, assignee, showArchived });
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
      // An image cover points at its source attachment's URL; deleting that
      // attachment must clear the cover too, or the card is left pointing at
      // a broken image with no way back to it from the UI.
      const card = (await listProjectCards(params.slug)).find((item) => item.id === cardId);
      const attachment = (await listCardAttachments(params.slug, cardId)).find((item) => item.id === id);
      if (card && attachment && card.coverColor === attachment.url) await updateProjectCard({ ...card, coverColor: '' });
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
  },
  renameBoard: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to rename this board.' });
    const name = String((await request.formData()).get('name') ?? '').trim();
    if (!name || name.length > 120) return fail(400, { error: 'Choose a board name up to 120 characters.' });
    try {
      await updateProjectName(params.slug, name);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: '', summary: `Renamed the board to “${name}”.` });
    } catch (error) {
      return persistenceFailure('rename board failed', error);
    }
    return { message: 'Board renamed.' };
  },
  toggleStar: async ({ request, locals, params }) => {
    if (!locals.username) return fail(401, { error: 'Sign in to star a board.' });
    const starred = String((await request.formData()).get('starred') ?? 'true') === 'true';
    try {
      await setProjectStar(locals.username, params.slug, starred);
    } catch (error) {
      return persistenceFailure('toggle board star failed', error);
    }
    return { message: starred ? 'Board starred.' : 'Board unstarred.' };
  },
  addLane: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to add a list.' });
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim().slice(0, 48);
    const after = String(form.get('after') ?? '').trim();
    if (!name) return fail(400, { error: 'Name the new list.' });
    const current = await validLanes(params.slug);
    if (current.includes(name)) return fail(409, { error: 'A list with that name already exists.' });
    if (current.length >= 8) return fail(400, { error: 'A board supports at most 8 lists.' });
    const insertAt = after === '' ? 0 : after === '__end__' ? current.length : current.indexOf(after) + 1;
    const lanes = [...current];
    lanes.splice(insertAt < 0 ? current.length : insertAt, 0, name);
    try {
      await saveBoardSettings({ [`${projectPrefix(params.slug)}lanes`]: JSON.stringify(lanes) });
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'created', cardId: '', summary: `Added the list “${name}”.` });
    } catch (error) {
      return persistenceFailure('add list failed', error);
    }
    return { message: 'List added.' };
  },
  renameLane: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to rename a list.' });
    const form = await request.formData();
    const from = String(form.get('from') ?? '').trim();
    const to = String(form.get('to') ?? '').trim().slice(0, 48);
    if (!to) return fail(400, { error: 'Name the list.' });
    const current = await validLanes(params.slug);
    if (!current.includes(from)) return fail(400, { error: 'Choose a valid list.' });
    if (to !== from && current.includes(to)) return fail(409, { error: 'A list with that name already exists.' });
    if (to === from) return { message: 'List name unchanged.' };
    try {
      await renameProjectLanes(params.slug, [{ from, to }]);
      await saveBoardSettings({ [`${projectPrefix(params.slug)}lanes`]: JSON.stringify(current.map((lane) => (lane === from ? to : lane))) });
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: '', summary: `Renamed the list “${from}” to “${to}”.` });
    } catch (error) {
      return persistenceFailure('rename list failed', error);
    }
    return { message: 'List renamed.' };
  },
  moveAllInLane: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to move cards.' });
    const form = await request.formData();
    const fromLane = String(form.get('fromLane') ?? '').trim();
    const toLane = String(form.get('toLane') ?? '').trim();
    const lanes = await validLanes(params.slug);
    if (!lanes.includes(fromLane) || !lanes.includes(toLane) || fromLane === toLane) return fail(400, { error: 'Choose two different, valid lists.' });
    try {
      const moved = await moveAllCardsInLane(params.slug, fromLane, toLane);
      if (moved > 0) await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: '', summary: `Moved ${moved} card${moved === 1 ? '' : 's'} from “${fromLane}” to “${toLane}”.` });
    } catch (error) {
      return persistenceFailure('move all cards failed', error);
    }
    return { message: 'Cards moved.' };
  },
  archiveAllInLane: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to archive cards.' });
    const form = await request.formData();
    const lane = String(form.get('lane') ?? '').trim();
    const lanes = await validLanes(params.slug);
    if (!lanes.includes(lane)) return fail(400, { error: 'Choose a valid list.' });
    try {
      const archived = await archiveAllCardsInLane(params.slug, lane, true);
      if (archived > 0) await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: '', summary: `Archived ${archived} card${archived === 1 ? '' : 's'} in “${lane}”.` });
    } catch (error) {
      return persistenceFailure('archive all cards failed', error);
    }
    return { message: 'List archived.' };
  },
  copyLane: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to copy a list.' });
    if (await projectIsSourceOwned(params.slug)) return sourceLockedError();
    const form = await request.formData();
    const sourceLane = String(form.get('sourceLane') ?? '').trim();
    const name = String(form.get('name') ?? '').trim().slice(0, 48);
    const current = await validLanes(params.slug);
    if (!current.includes(sourceLane) || !name) return fail(400, { error: 'Choose a valid source list and a name for the copy.' });
    if (current.includes(name)) return fail(409, { error: 'A list with that name already exists.' });
    if (current.length >= 8) return fail(400, { error: 'A board supports at most 8 lists.' });
    const lanes = [...current];
    lanes.splice(current.indexOf(sourceLane) + 1, 0, name);
    const sourceCards = (await listProjectCards(params.slug)).filter((card) => card.lane === sourceLane && !card.archived);
    try {
      await saveBoardSettings({ [`${projectPrefix(params.slug)}lanes`]: JSON.stringify(lanes) });
      for (const card of sourceCards) {
        await createProjectCard({ id: `card-${Date.now()}-${randomBytes(6).toString('hex')}`, projectSlug: params.slug, title: card.title, details: card.details, lane: name, owner: card.owner, priority: card.priority, dueDate: card.dueDate, dueComplete: false, startDate: card.startDate, archived: false, checklist: card.checklist.map((item, index) => ({ ...item, id: `check-${Date.now()}-${index}-${randomBytes(3).toString('hex')}`, done: false })), coverColor: card.coverColor, tagIds: card.tags.map((tag) => tag.id) });
      }
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'created', cardId: '', summary: `Copied “${sourceLane}” to “${name}” (${sourceCards.length} card${sourceCards.length === 1 ? '' : 's'}).` });
    } catch (error) {
      return persistenceFailure('copy list failed', error);
    }
    return { message: 'List copied.' };
  },
  setWipLimit: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to set a work-in-progress limit.' });
    const form = await request.formData();
    const lane = String(form.get('lane') ?? '').trim();
    const limitRaw = String(form.get('limit') ?? '').trim();
    const lanes = await validLanes(params.slug);
    if (!lanes.includes(lane)) return fail(400, { error: 'Choose a valid list.' });
    const limit = limitRaw === '' ? null : Number(limitRaw);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 999)) return fail(400, { error: 'Choose a whole number between 1 and 999, or clear the limit.' });
    const allSettings = await loadBoardSettings();
    const key = `${projectPrefix(params.slug)}wip_limits`;
    let limits: Record<string, number> = {};
    try { limits = JSON.parse(allSettings[key] ?? '{}'); } catch { /* start fresh on malformed state */ }
    if (limit === null) delete limits[lane]; else limits[lane] = limit;
    try {
      await saveBoardSettings({ [key]: JSON.stringify(limits) });
    } catch (error) {
      return persistenceFailure('set WIP limit failed', error);
    }
    return { message: limit === null ? 'Limit cleared.' : 'Limit set.' };
  },
  saveCardAsTemplate: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to save a template.' });
    const form = await request.formData();
    const cardId = String(form.get('cardId') ?? '').trim();
    const name = String(form.get('name') ?? '').trim().slice(0, 48);
    if (!name) return fail(400, { error: 'Name the template before saving it.' });
    const card = (await listProjectCards(params.slug)).find((item) => item.id === cardId);
    if (!card) return fail(400, { error: 'Choose a valid card.' });
    const templates = await templatesFor(params.slug);
    const forLane = templates[card.lane] ?? [];
    if (forLane.length >= 10) return fail(400, { error: `"${card.lane}" already has 10 templates, the most a list supports.` });
    const template: CardTemplate = {
      id: `template-${Date.now()}-${randomBytes(3).toString('hex')}`,
      name,
      title: card.title,
      details: card.details,
      priority: card.priority,
      coverColor: card.coverColor,
      checklist: card.checklist.map((item) => ({ id: item.id, text: item.text })),
      tagIds: card.tags.map((tag) => tag.id)
    };
    try {
      await saveBoardSettings({ [`${projectPrefix(params.slug)}templates`]: JSON.stringify({ ...templates, [card.lane]: [...forLane, template] }) });
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: '', summary: `Saved “${name}” as a template on “${card.lane}”.` });
    } catch (error) {
      return persistenceFailure('save template failed', error);
    }
    return { message: 'Template saved.' };
  },
  deleteTemplate: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to remove a template.' });
    const form = await request.formData();
    const lane = String(form.get('lane') ?? '').trim();
    const templateId = String(form.get('templateId') ?? '').trim();
    const templates = await templatesFor(params.slug);
    const forLane = templates[lane] ?? [];
    const next = forLane.filter((template) => template.id !== templateId);
    if (next.length === forLane.length) return fail(400, { error: 'Choose a valid template.' });
    try {
      await saveBoardSettings({ [`${projectPrefix(params.slug)}templates`]: JSON.stringify({ ...templates, [lane]: next }) });
    } catch (error) {
      return persistenceFailure('delete template failed', error);
    }
    return { message: 'Template removed.' };
  },
  createCardFromTemplate: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to create project cards.' });
    if (await projectIsSourceOwned(params.slug)) return sourceLockedError();
    const form = await request.formData();
    const lane = String(form.get('lane') ?? '').trim();
    const templateId = String(form.get('templateId') ?? '').trim();
    const lanes = await validLanes(params.slug);
    if (!lanes.includes(lane)) return fail(400, { error: 'Choose a valid list.' });
    const templates = await templatesFor(params.slug);
    const template = (templates[lane] ?? []).find((item) => item.id === templateId);
    if (!template) return fail(400, { error: 'Choose a valid template.' });
    const card = {
      id: `card-${Date.now()}-${randomBytes(6).toString('hex')}`,
      projectSlug: params.slug,
      title: template.title,
      details: template.details,
      lane,
      owner: '',
      priority: template.priority,
      dueDate: null,
      dueComplete: false,
      startDate: null,
      archived: false,
      checklist: template.checklist.map((item, index) => ({ ...item, id: `check-${Date.now()}-${index}-${randomBytes(3).toString('hex')}`, done: false })),
      coverColor: template.coverColor,
      tagIds: template.tagIds
    };
    try {
      await createProjectCard(card);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'created', cardId: card.id, summary: `Created “${card.title}” from the “${template.name}” template.` });
    } catch (error) {
      return persistenceFailure('create card from template failed', error);
    }
    return { message: 'Card created from template.' };
  }
};
