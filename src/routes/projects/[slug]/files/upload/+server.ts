import { json } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { getBoardProject, listProjectFiles, normalizeProjectFilePath, recordProjectActivity, upsertProjectFile } from '$lib/server/persistence';
import { deleteProjectFileObject, projectFileObjectKey, putProjectFileObject, r2Configured } from '$lib/server/r2';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');
const textExtensions = new Set(['md', 'markdown', 'txt', 'json', 'yaml', 'yml', 'csv', 'html', 'css', 'js', 'ts', 'svelte', 'dart', 'shader', 'frag', 'vert', 'uxml', 'uss']);
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const binaryExtensions = new Set(['pdf', 'zip', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov']);

function kindFor(path: string, mime = ''): 'text' | 'image' | 'binary' | null {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  if (textExtensions.has(extension)) return 'text';
  if (imageExtensions.has(extension) || mime.startsWith('image/')) return 'image';
  if (binaryExtensions.has(extension)) return 'binary';
  return null;
}

function mimeFor(path: string, supplied: string) {
  if (supplied) return supplied.slice(0, 120);
  const extension = path.split('.').pop()?.toLowerCase();
  return extension === 'md' || extension === 'markdown' ? 'text/markdown' : 'application/octet-stream';
}

export async function POST({ request, locals, params }) {
  if (!canEdit(locals.role)) return json({ error: 'Editor access is required to upload project files.' }, { status: 403 });
  if (!await getBoardProject(params.slug)) return json({ error: 'Project not found.' }, { status: 404 });
  const form = await request.formData();
  const upload = form.get('file');
  if (!(upload instanceof File) || upload.size === 0) return json({ error: 'Choose a file to upload.' }, { status: 400 });
  const requestedPath = String(form.get('path') ?? '').trim();
  let path: string;
  try { path = normalizeProjectFilePath(requestedPath || upload.name); }
  catch { return json({ error: 'Use a relative file path with letters, numbers, dots, dashes, or folders.' }, { status: 400 }); }
  const kind = kindFor(path, upload.type);
  if (!kind) return json({ error: 'This file type is not supported.' }, { status: 415 });
  const limit = kind === 'text' ? 1_000_000 : kind === 'image' ? 10_000_000 : 25_000_000;
  if (upload.size > limit) return json({ error: `Keep ${kind} files below ${Math.round(limit / 1_000_000)} MB.` }, { status: 413 });
  const existing = (await listProjectFiles(params.slug)).find((file) => file.path === path);
  const id = existing?.id ?? `file-${Date.now()}-${randomBytes(6).toString('hex')}`;
  const content = kind === 'text' ? await upload.text() : '';
  const mimeType = mimeFor(path, upload.type);
  const body = kind === 'text' ? content : new Uint8Array(await upload.arrayBuffer());
  const key = projectFileObjectKey(params.slug, id, path);
  if (r2Configured()) await putProjectFileObject(key, body, mimeType);
  let file;
  try {
    file = await upsertProjectFile({ id, projectSlug: params.slug, path, content, size: upload.size, mimeType, createdBy: existing?.createdBy ?? locals.username ?? 'unknown' });
  } catch (error) {
    if (r2Configured()) await deleteProjectFileObject(key).catch(() => undefined);
    console.error('[file upload persistence]', error);
    return json({ error: 'The file could not be saved. Try again shortly.' }, { status: 503 });
  }
  await recordProjectActivity({ projectSlug: params.slug, actor: locals.username ?? 'unknown', action: existing ? 'updated' : 'created', cardId: '', summary: `${existing ? 'Replaced' : 'Uploaded'} file ${file.path}.` });
  return json({ id: file.id, path: file.path, kind, url: `/projects/${params.slug}/files/raw?path=${encodeURIComponent(file.path)}` });
}
