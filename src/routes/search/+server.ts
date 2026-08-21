import { json } from '@sveltejs/kit';
import { searchProjectContent } from '$lib/server/persistence';
import { cached } from '$lib/server/cache';

/**
 * The top-bar search fires on a 220ms debounce, so a person typing one word
 * produces several near-identical queries across every board's cards, wiki
 * pages, and cloud files. A
 * short TTL collapses that burst without letting a result go visibly stale:
 * a card renamed now is findable by its new name within half a minute, and
 * the card it opens is always loaded fresh from the board route anyway.
 */
const SEARCH_TTL_SECONDS = 30;

export async function GET({ url, locals }) {
  if (!locals.username) return json({ results: [] }, { status: 401 });
  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length < 2) return json({ results: [] });
  // Results are identical for every signed-in user (search spans all boards),
  // so the key deliberately excludes the username rather than fragmenting the
  // cache per person for no difference in output. The `v2` segment retires
  // entries cached when this returned cards only — a shape change has to
  // invalidate, or a warm cache serves the old shape into the new UI.
  const results = await cached(
    `search:v2:${query.toLowerCase()}`,
    SEARCH_TTL_SECONDS,
    () => searchProjectContent(query)
  );
  return json({ results });
}
