import { loadBoardSettings } from '$lib/server/persistence';

export async function load() {
  return { settings: await loadBoardSettings() };
}
