import { fail } from '@sveltejs/kit';
import { sessionCookie } from '$lib/server/auth';
import { loadPlan, readSources, sourcePaths } from '$lib/server/plan';
import { buildPreview, buildProposedSource, replaceValidated, sourceHash, validateTransition, type TransitionRequest } from '$lib/server/transition';
import type { PacketState } from '$lib/types';

export async function load() {
  return { plan: await loadPlan() };
}

export const actions = {
  logout: async ({ cookies }) => {
    cookies.delete(sessionCookie, { path: '/' });
    return { message: 'Signed out.' };
  },
  previewTransition: async ({ request }) => {
    const form = await request.formData();
    const packetId = String(form.get('packetId') ?? '');
    const nextState = String(form.get('nextState') ?? '') as PacketState;
    const owner = String(form.get('owner') ?? '');
    const evidence = String(form.get('evidence') ?? '');
    const remainder = String(form.get('remainder') ?? '');
    const plan = await loadPlan();
    const packet = plan.packets.find((item) => item.id === packetId);
    if (!packet) return fail(400, { errors: ['Select a valid packet.'] });
    const transition: TransitionRequest = { packetId, nextState, owner, evidence, remainder };
    const errors = validateTransition(packet, transition, plan.readyIds.includes(packetId));
    if (errors.length) return fail(400, { errors, values: transition });
    const [unity] = await readSources();
    try {
      return { preview: buildPreview(unity, packet, transition, plan.readyIds.includes(packetId)), values: transition };
    } catch (error) {
      return fail(400, { errors: [error instanceof Error ? error.message : 'Unable to create preview.'], values: transition });
    }
  },
  applyTransition: async ({ request }) => {
    if (process.env.VERCEL) return fail(405, { errors: ['Hosted deployments are read-only. Apply changes from the local project server.'] });
    const form = await request.formData();
    const packetId = String(form.get('packetId') ?? '');
    const confirmation = String(form.get('confirmation') ?? '');
    const expectedHash = String(form.get('sourceHash') ?? '');
    const transition: TransitionRequest = {
      packetId,
      nextState: String(form.get('nextState') ?? '') as PacketState,
      owner: String(form.get('owner') ?? ''),
      evidence: String(form.get('evidence') ?? ''),
      remainder: String(form.get('remainder') ?? '')
    };
    if (confirmation !== packetId) return fail(400, { errors: ['Type the exact packet ID to apply this preview.'], values: transition });
    const plan = await loadPlan();
    const packet = plan.packets.find((item) => item.id === packetId);
    if (!packet) return fail(400, { errors: ['Select a valid packet.'], values: transition });
    const [unity] = await readSources();
    if (sourceHash(unity) !== expectedHash) return fail(409, { errors: ['The source changed after preview. Reload and create a new preview.'], values: transition });
    try {
      const proposed = buildProposedSource(unity, packet, transition, plan.readyIds.includes(packetId));
      const { unityPath } = sourcePaths();
      await replaceValidated(unityPath, proposed, async (temporary) => {
        const { readFile } = await import('node:fs/promises');
        const checked = await readFile(temporary, 'utf8');
        if (!checked.includes(`| ${packetId} | ${transition.nextState} |`)) throw new Error('Temporary proposal failed ledger validation.');
      });
      return { applied: packetId, message: `${packetId} updated. The source was replaced atomically.` };
    } catch (error) {
      return fail(400, { errors: [error instanceof Error ? error.message : 'Unable to apply transition.'], values: transition });
    }
  }
};
