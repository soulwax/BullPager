import { redirect } from '@sveltejs/kit';

/**
 * The board list moved to `/`, which is where a board tool's front door
 * belongs. This redirect keeps older links and bookmarks working rather than
 * turning them into 404s.
 */
export function load() {
  throw redirect(308, '/');
}
