import { loadBoardSettings } from '$lib/server/persistence';

export async function load({ locals }) {
  let settings: Record<string, string> = {};
  try {
    settings = await loadBoardSettings();
  } catch (error) {
    console.error('[settings] unable to load shared appearance settings', error);
  }
  return { settings, username: locals.username ?? '', role: locals.role };
}
