import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { createProjectFolder, deleteProjectFile, getBoardProject, getProjectFile, listProjectFiles, listProjectFolders, normalizeProjectFilePath, normalizeProjectPath, recordProjectActivity, upsertProjectFile } from '$lib/server/persistence';
import { deleteProjectFileObject, getProjectFileObjectUrl, projectFileObjectKey, putProjectFileObject, r2Configured } from '$lib/server/r2';
import type { ProjectFile } from '$lib/types';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');
const textExtensions = new Set(['md', 'markdown', 'txt', 'json', 'yaml', 'yml', 'csv', 'html', 'css', 'js', 'ts', 'svelte', 'dart', 'shader', 'frag', 'vert', 'uxml', 'uss']);
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const binaryExtensions = new Set(['pdf', 'zip', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov']);

function isTextPath(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return textExtensions.has(extension);
}

function fileKind(path: string, mime = ''): 'text' | 'image' | 'binary' | null {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  if (textExtensions.has(extension)) return 'text';
  if (imageExtensions.has(extension) || mime.startsWith('image/')) return 'image';
  if (binaryExtensions.has(extension)) return 'binary';
  return null;
}

function mimeFor(path: string) {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown') ? 'text/markdown' : 'text/plain';
}

function persistenceFailure(error: unknown) {
  console.error('[file persistence]', error);
  return fail(503, { error: 'The file could not be saved. Try again shortly.' });
}

export async function load({ params, url, locals }) {
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/settings');
  const folders = await listProjectFolders(params.slug);
  const files = await Promise.all((await listProjectFiles(params.slug)).map(async (file) => {
    if (!file.mimeType.startsWith('image/') || !r2Configured()) return file;
    try { return { ...file, previewUrl: await getProjectFileObjectUrl(projectFileObjectKey(params.slug, file.id, file.path)) }; }
    catch { return file; }
  }));
  const requested = url.searchParams.get('file') ?? '';
  const selected = files.find((file) => file.id === requested) ?? files[0] ?? null;
  return { project, files, folders, selected, canEdit: canEdit(locals.role), username: locals.username ?? 'unknown', role: locals.role ?? '' };
}

export const actions = {
  createFolder: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to create project folders.' });
    const form = await request.formData();
    const requestedPath = String(form.get('path') ?? '').trim();
    const parent = String(form.get('parent') ?? '').trim();
    const path = parent && requestedPath && !requestedPath.startsWith(`${parent}/`) ? `${parent}/${requestedPath}` : requestedPath;
    try {
      const folder = await createProjectFolder(params.slug, normalizeProjectPath(path), locals.username ?? 'unknown');
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username ?? 'unknown', action: 'created', cardId: '', summary: `Created folder ${folder.path}.` });
      return { message: `${folder.path} created.` };
    } catch (error) {
      if (error instanceof Error && error.message === 'FOLDER_EXISTS') return fail(409, { error: 'That folder already exists.' });
      if (error instanceof Error && error.message.includes('folder path')) return fail(400, { error: 'Use a relative folder path with letters, numbers, dots, dashes, or folders.' });
      return persistenceFailure(error);
    }
  },
  saveFile: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit project files.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const path = String(form.get('path') ?? '').trim();
    const content = String(form.get('content') ?? '');
    if (!path || !isTextPath(path)) return fail(400, { error: 'Choose a supported text-file path such as docs/overview.md.' });
    if (Buffer.byteLength(content, 'utf8') > 1_000_000) return fail(413, { error: 'Keep text files below 1 MB.' });
    try {
      const existing = id ? await getProjectFile(params.slug, id) : null;
      if (id && !existing) return fail(404, { error: 'That file no longer exists. Refresh the workspace.' });
      const fileId = existing?.id ?? `file-${Date.now()}-${randomBytes(6).toString('hex')}`;
      let normalizedPath: string;
      try { normalizedPath = normalizeProjectFilePath(path); }
      catch { return fail(400, { error: 'Use a relative file path with letters, numbers, dots, dashes, or folders.' }); }
      const mimeType = mimeFor(path);
      const nextKey = projectFileObjectKey(params.slug, fileId, normalizedPath);
      if (r2Configured()) await putProjectFileObject(nextKey, content, mimeType);
      let file: ProjectFile;
      try {
        file = await upsertProjectFile({ id: fileId, projectSlug: params.slug, path: normalizedPath, content, mimeType, createdBy: existing?.createdBy ?? locals.username ?? 'unknown' });
      } catch (error) {
        if (r2Configured() && (!existing || projectFileObjectKey(params.slug, existing.id, existing.path) !== nextKey)) await deleteProjectFileObject(nextKey).catch(() => undefined);
        throw error;
      }
      if (r2Configured() && existing && projectFileObjectKey(params.slug, existing.id, existing.path) !== nextKey) await deleteProjectFileObject(projectFileObjectKey(params.slug, existing.id, existing.path));
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username ?? 'unknown', action: existing ? 'updated' : 'created', cardId: '', summary: `${existing ? 'Updated' : 'Created'} file ${file.path}.` });
      return { message: `${file.path} saved.`, fileId: file.id };
    } catch (error) {
      return persistenceFailure(error);
    }
  },
  uploadFile: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to upload project files.' });
    const form = await request.formData();
    const upload = form.get('file');
    const requestedPath = String(form.get('path') ?? '').trim();
    if (!(upload instanceof File) || upload.size === 0) return fail(400, { error: 'Choose a file to upload.' });
    const path = requestedPath || upload.name;
    const kind = fileKind(path, upload.type);
    if (!kind) return fail(415, { error: 'This file type is not supported.' });
    const limit = kind === 'text' ? 1_000_000 : kind === 'image' ? 10_000_000 : 25_000_000;
    if (upload.size > limit) return fail(413, { error: `Keep ${kind} files below ${Math.round(limit / 1_000_000)} MB.` });
    try {
      const content = kind === 'text' ? await upload.text() : '';
      let normalizedPath: string;
      try { normalizedPath = normalizeProjectFilePath(path); }
      catch { return fail(400, { error: 'Use a relative file path with letters, numbers, dots, dashes, or folders.' }); }
      const existing = (await listProjectFiles(params.slug)).find((file) => file.path === normalizedPath);
      const fileId = existing?.id ?? `file-${Date.now()}-${randomBytes(6).toString('hex')}`;
      const mimeType = upload.type || mimeFor(path);
      const nextKey = projectFileObjectKey(params.slug, fileId, normalizedPath);
      const body = kind === 'text' ? content : new Uint8Array(await upload.arrayBuffer());
      if (r2Configured()) await putProjectFileObject(nextKey, body, mimeType);
      let file: ProjectFile;
      try {
        file = await upsertProjectFile({ id: fileId, projectSlug: params.slug, path: normalizedPath, content, size: upload.size, mimeType, createdBy: existing?.createdBy ?? locals.username ?? 'unknown' });
      } catch (error) {
        if (r2Configured() && (!existing || projectFileObjectKey(params.slug, existing.id, existing.path) !== nextKey)) await deleteProjectFileObject(nextKey).catch(() => undefined);
        throw error;
      }
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username ?? 'unknown', action: existing ? 'updated' : 'created', cardId: '', summary: `${existing ? 'Replaced' : 'Uploaded'} file ${file.path}.` });
      return { message: `${file.path} uploaded.`, fileId: file.id };
    } catch (error) {
      return persistenceFailure(error);
    }
  },
  deleteFile: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to delete project files.' });
    const id = String((await request.formData()).get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose a file.' });
    try {
      const file = await getProjectFile(params.slug, id);
      if (!file) return fail(404, { error: 'That file no longer exists.' });
      await deleteProjectFile(params.slug, id);
      if (r2Configured()) await deleteProjectFileObject(projectFileObjectKey(params.slug, file.id, file.path));
      await recordProjectActivity({ projectSlug: params.slug, actor: locals.username ?? 'unknown', action: 'deleted', cardId: '', summary: `Deleted file ${file.path}.` });
      return { message: `${file.path} deleted.` };
    } catch (error) {
      return persistenceFailure(error);
    }
  }
};
