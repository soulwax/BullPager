import { loadPlan } from '$lib/server/plan';

export async function load() {
  return { plan: await loadPlan() };
}
