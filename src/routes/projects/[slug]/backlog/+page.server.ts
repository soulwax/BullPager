import { redirect } from '@sveltejs/kit';
import { getBoardProject, listProjectCards, listProjectTags, persistenceEnabled, syncUnityPlannerCards } from '$lib/server/persistence';
import { loadPlan } from '$lib/server/plan';

export async function load({ params, locals }) {
  if (params.slug === 'unity-plan' && persistenceEnabled()) {
    const plan = await loadPlan();
    if (plan.valid && plan.packets.length) {
      try {
        await syncUnityPlannerCards(plan.packets, { sourceDigest: plan.sourceDigest, actor: locals.username || 'planner' });
      } catch (error) {
        console.error('[unity backlog sync] unable to mirror implementation packets', error);
      }
    }
  }
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/projects');
  const username = locals.username ?? 'anonymous';
  const [cards, tags] = await Promise.all([
    listProjectCards(params.slug, username),
    listProjectTags(params.slug)
  ]);
  return { project, cards, tags };
}
