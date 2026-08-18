import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { getBoardProject, loadBoardSettings, normalizeProjectFilePath, recordProjectActivity, renameProjectLanes, saveBoardSettings, upsertProjectFile } from '$lib/server/persistence';
import { putProjectFileObject, projectFileObjectKey, r2Configured } from '$lib/server/r2';
import { lanesFromSettings } from '$lib/projectState';
import { projectBackgrounds } from '$lib/projectBackgrounds';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');
const persistenceFailure = (error: unknown) => {
  console.error('[project persistence] settings save failed', error);
  return fail(503, { error: 'The database is temporarily unavailable. Your settings were not changed; try again shortly.' });
};

export async function load({ params, locals, url }) {
  if (!canEdit(locals.role)) throw redirect(303, '/');
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/settings');
  const settings = await loadBoardSettings();
  const prefix = `project_${params.slug}_`;
  return { slug: params.slug, project, prefix, created: url.searchParams.get('created') === '1', settings: Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith(prefix))) };
}

export const actions = {
  saveSettings: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Project editor access is required.' });
    const project = await getBoardProject(params.slug);
    if (!project) return fail(404, { error: 'Project not found.' });
    const form = await request.formData();
    const prefix = `project_${params.slug}_`;
    const key = String(form.get('workflowKey') ?? '').trim();
    const cadence = String(form.get('cadence') ?? 'weekly');
    const visibility = String(form.get('visibility') ?? 'private');
    const boardTheme = String(form.get('boardTheme') ?? 'midnight');
    const background = String(form.get('background') ?? 'none');
    const glassIntensity = Number(form.get('glassIntensity') ?? 38);
    const cardDensity = String(form.get('cardDensity') ?? 'comfortable');
    const showOutcomes = form.get('showOutcomes') === 'on' ? 'true' : 'false';
    const laneStyle = String(form.get('laneStyle') ?? 'scroll');
    const laneNames = form.getAll('laneName').map((lane) => String(lane).trim()).filter(Boolean);
    const laneOriginals = form.getAll('laneOriginal').map((lane) => String(lane).trim());
    const lanes = laneNames.length ? laneNames : String(form.get('lanes') ?? '').split(',').map((lane) => lane.trim()).filter(Boolean);
    const validBackground = background === 'custom' || projectBackgrounds.some((item) => item.id === background);
    if (key.length > 120 || !['weekly', 'biweekly', 'monthly'].includes(cadence) || !['private', 'shared'].includes(visibility) || !['midnight', 'ocean', 'light'].includes(boardTheme) || !validBackground || !Number.isInteger(glassIntensity) || glassIntensity < 0 || glassIntensity > 100 || !['comfortable', 'compact'].includes(cardDensity) || !['scroll', 'wrap'].includes(laneStyle) || lanes.length < 2 || lanes.length > 8 || new Set(lanes).size !== lanes.length || lanes.some((lane) => lane.length > 48)) return fail(400, { error: 'Choose valid project settings.' });
    const currentSettings = await loadBoardSettings();
    const currentLanes = lanesFromSettings(currentSettings, prefix);
    const renames = laneNames.length ? laneNames.map((name, index) => ({ from: laneOriginals[index] ?? '', to: name })) : [];
    const settingsToSave: Record<string, string> = { [`${prefix}workflow_key`]: key, [`${prefix}cadence`]: cadence, [`${prefix}visibility`]: visibility, [`${prefix}theme`]: boardTheme, [`${prefix}background`]: background, [`${prefix}glass_intensity`]: String(glassIntensity), [`${prefix}density`]: cardDensity, [`${prefix}show_outcomes`]: showOutcomes, [`${prefix}lane_style`]: laneStyle, [`${prefix}lanes`]: JSON.stringify(lanes) };
    try {
      await renameProjectLanes(params.slug, renames.filter((rename) => currentLanes.includes(rename.from)));
      await saveBoardSettings(settingsToSave);
    } catch (error) {
      return persistenceFailure(error);
    }
    return { message: 'Project settings saved.' };
  },
  uploadBackground: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Project editor access is required.' });
    const project = await getBoardProject(params.slug);
    if (!project) return fail(404, { error: 'Project not found.' });
    const form = await request.formData();
    const upload = form.get('file');
    if (!(upload instanceof File) || upload.size === 0) return fail(400, { error: 'Choose an image to upload.' });
    if (!upload.type.startsWith('image/')) return fail(415, { error: 'Choose an image file (PNG, JPEG, WebP, or GIF).' });
    if (upload.size > 10_000_000) return fail(413, { error: 'Keep background images below 10 MB.' });
    const extension = upload.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = normalizeProjectFilePath(`board-background/${Date.now()}-${randomBytes(4).toString('hex')}.${extension}`);
    const prefix = `project_${params.slug}_`;
    try {
      const fileId = `file-${Date.now()}-${randomBytes(6).toString('hex')}`;
      const body = new Uint8Array(await upload.arrayBuffer());
      const key = projectFileObjectKey(params.slug, fileId, path);
      if (r2Configured()) await putProjectFileObject(key, body, upload.type);
      await upsertProjectFile({ id: fileId, projectSlug: params.slug, path, content: '', size: upload.size, mimeType: upload.type, createdBy: locals.username ?? 'unknown' });
      await saveBoardSettings({ [`${prefix}background`]: 'custom', [`${prefix}background_custom_path`]: path });
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username || 'unknown', action: 'updated', cardId: '', summary: 'Uploaded a custom board background.' });
    } catch (error) {
      return persistenceFailure(error);
    }
    return { message: 'Background uploaded.' };
  }
};
