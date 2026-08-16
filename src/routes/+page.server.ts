import { fail } from '@sveltejs/kit';
import { loadPlan, readSources } from '$lib/server/plan';
import { buildPreview, validateTransition, type TransitionRequest } from '$lib/server/transition';
import type { PacketState } from '$lib/types';

export async function load() {
  return { plan: await loadPlan() };
}

export const actions = {
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
  }
};
