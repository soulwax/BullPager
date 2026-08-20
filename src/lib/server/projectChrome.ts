import { loadBoardSettings } from '$lib/server/persistence';
import { projectPrefix } from '$lib/projectState';

/**
 * The appearance a project page needs to render its own chrome.
 *
 * Every project page shares one header and one theme, but only the board and
 * the settings form used to load the settings that define them — so choosing
 * "Paper" themed the board and left the backlog, files, graph, and settings
 * pages on the default. This is the one call each page makes so the choice
 * follows the person across all of them.
 */
export async function loadProjectChrome(slug: string) {
  const settings = await loadBoardSettings();
  const prefix = projectPrefix(slug);
  return {
    prefix,
    // Only this project's keys: the full settings map carries every other
    // board's configuration and has no business in a page payload.
    settings: Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith(prefix)))
  };
}
