import { fail, redirect } from '@sveltejs/kit';
import { getBoardProject, listProjectTags, loadBoardSettings, recordProjectActivity, saveBoardSettings } from '$lib/server/persistence';
import { lanesFromSettings, projectPrefix } from '$lib/projectState';
import { sanitizeAutomationRule, sanitizeAutomationRules, type AutomationRule } from '$lib/automation';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');

async function loadRules(slug: string): Promise<{ rules: AutomationRule[]; lanes: string[]; tagIds: string[] }> {
  const [settings, tags] = await Promise.all([loadBoardSettings(), listProjectTags(slug)]);
  const prefix = projectPrefix(slug);
  const lanes = lanesFromSettings(settings, prefix);
  const tagIds = tags.map((tag) => tag.id);
  let raw: unknown = [];
  try {
    raw = JSON.parse(settings[`${prefix}automations`] ?? '[]');
  } catch {
    raw = [];
  }
  return { rules: sanitizeAutomationRules(raw, lanes, tagIds), lanes, tagIds };
}

function saveRules(slug: string, rules: AutomationRule[]) {
  return saveBoardSettings({ [`${projectPrefix(slug)}automations`]: JSON.stringify(rules) });
}

export async function load({ params, locals }) {
  if (!canEdit(locals.role)) throw redirect(303, `/projects/${params.slug}`);
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/projects');
  const { rules, lanes } = await loadRules(params.slug);
  const tags = await listProjectTags(params.slug);
  return { project, rules, lanes, tags };
}

export const actions = {
  saveRule: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change board automation.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const name = String(form.get('name') ?? '').trim();
    const triggerType = String(form.get('triggerType') ?? '');
    const triggerLane = String(form.get('triggerLane') ?? '');
    let rawActions: unknown[] = [];
    try {
      const parsed = JSON.parse(String(form.get('actionsJson') ?? '[]'));
      if (Array.isArray(parsed)) rawActions = parsed;
    } catch {
      // sanitizeAutomationRule rejects an empty action list below
    }
    const trigger = triggerType === 'enters-lane' ? { type: 'enters-lane' as const, lane: triggerLane } : { type: 'checklist-completed' as const };
    const { rules, lanes, tagIds } = await loadRules(params.slug);
    const rule = sanitizeAutomationRule({ id: id || undefined, name, enabled: true, trigger, actions: rawActions }, lanes, tagIds);
    if (!rule) return fail(400, { error: 'Choose a name, a valid trigger, and at least one valid action.' });
    const next = [...rules.filter((existing) => existing.id !== rule.id), rule];
    try {
      await saveRules(params.slug, next);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: '', summary: `Saved the automation rule “${rule.name}”.` });
    } catch (error) {
      console.error('[automation] save rule failed', error);
      return fail(503, { error: 'The database is temporarily unavailable. Try again shortly.' });
    }
    return { message: 'Automation rule saved.' };
  },
  toggleRule: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change board automation.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const enabled = String(form.get('enabled') ?? 'true') === 'true';
    const { rules } = await loadRules(params.slug);
    if (!rules.some((rule) => rule.id === id)) return fail(400, { error: 'Choose a valid rule.' });
    const next = rules.map((rule) => (rule.id === id ? { ...rule, enabled } : rule));
    try {
      await saveRules(params.slug, next);
    } catch (error) {
      console.error('[automation] toggle rule failed', error);
      return fail(503, { error: 'The database is temporarily unavailable. Try again shortly.' });
    }
    return { message: enabled ? 'Rule enabled.' : 'Rule disabled.' };
  },
  deleteRule: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to change board automation.' });
    const id = String((await request.formData()).get('id') ?? '').trim();
    const { rules } = await loadRules(params.slug);
    const next = rules.filter((rule) => rule.id !== id);
    if (next.length === rules.length) return fail(400, { error: 'Choose a valid rule.' });
    try {
      await saveRules(params.slug, next);
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'deleted', cardId: '', summary: 'Removed an automation rule.' });
    } catch (error) {
      console.error('[automation] delete rule failed', error);
      return fail(503, { error: 'The database is temporarily unavailable. Try again shortly.' });
    }
    return { message: 'Rule removed.' };
  }
};
