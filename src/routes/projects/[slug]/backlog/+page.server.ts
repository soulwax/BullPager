import { redirect } from '@sveltejs/kit';
import { getBoardProject, listProjectCards, listProjectTags, listStarredProjectSlugs, persistenceEnabled, syncUnityPlannerCards } from '$lib/server/persistence';
import { loadPlan } from '$lib/server/plan';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');

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
  const [cards, tags, starred] = await Promise.all([
    listProjectCards(params.slug, username),
    listProjectTags(params.slug),
    listStarredProjectSlugs(locals.username ?? '')
  ]);
  return { project, cards, tags, canEdit: canEdit(locals.role), username, starred: starred.has(params.slug) };
}
