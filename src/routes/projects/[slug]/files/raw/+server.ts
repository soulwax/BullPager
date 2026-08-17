import { error, redirect } from '@sveltejs/kit';
import { getProjectFileByPath } from '$lib/server/persistence';
import { getProjectFileObjectUrl, projectFileObjectKey, r2Configured } from '$lib/server/r2';

export async function GET({ params, url }) {
  const path = url.searchParams.get('path') ?? '';
  let file;
  try { file = await getProjectFileByPath(params.slug, path); }
  catch { throw error(400, 'Invalid file path.'); }
  if (!file) throw error(404, 'File not found.');
  if (r2Configured()) throw redirect(302, await getProjectFileObjectUrl(projectFileObjectKey(params.slug, file.id, file.path)));
  return new Response(file.content, { headers: { 'content-type': file.mimeType, 'cache-control': 'private, no-store' } });
}
