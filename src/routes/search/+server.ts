import { json } from '@sveltejs/kit';
import { searchProjectCards } from '$lib/server/persistence';

export async function GET({ url, locals }) {
  if (!locals.username) return json({ results: [] }, { status: 401 });
  const query = url.searchParams.get('q') ?? '';
  const results = await searchProjectCards(query);
  return json({ results });
}
