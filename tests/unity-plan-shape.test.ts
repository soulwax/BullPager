import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePackets, validatePackets, MAX_RIGHTSIZED_HANDLES, MIN_RIGHTSIZED_HANDLES } from '../src/lib/server/plan';

/**
 * The bundled snapshot is what the deployed board parses, so it — not the
 * working copy at the repo root — is the thing that has to satisfy the
 * packet grammar. A plan that fails here renders a board full of validation
 * errors instead of cards.
 */
const plan = readFileSync(new URL('../content/UNITY_PLAN.md', import.meta.url), 'utf8');
const packets = parsePackets(plan);

describe('UNITY_PLAN.md packet shape', () => {
  it('parses every WARD packet', () => {
    expect(packets.length).toBe((plan.match(/^### WARD-\d+ —/gm) ?? []).length);
    expect(packets.length).toBeGreaterThan(0);
  });

  it('validates cleanly', () => {
    const errors = validatePackets(packets);
    expect(errors).toEqual([]);
  });

  it('keeps every packet inside the right-sized handle band', () => {
    const outside = packets
      .map((packet) => ({ id: packet.id, handles: (packet.handles ?? []).length }))
      .filter((row) => row.handles < MIN_RIGHTSIZED_HANDLES || row.handles > MAX_RIGHTSIZED_HANDLES);
    expect(outside).toEqual([]);
  });
});

/**
 * The detail pass gives every handle its own step, so a human pulling a packet
 * gets one instruction per sitting instead of 3-6 coarse steps standing in for
 * 9-15 named handles. A packet is "detailed" once its first step opens with a
 * backticked handle; from that point the mapping must be exact, because a step
 * list that drifts from the handle list is worse than none — the board shows
 * the steps but the checklist is built from the handles.
 */
describe('per-handle implementation detail', () => {
  const detailed = packets.filter((packet) => /^1\. `[a-z0-9-]+` —/m.test(packet.steps));

  it('covers every packet, so a new one cannot ship undetailed', () => {
    const undetailed = packets.filter((packet) => !detailed.includes(packet)).map((packet) => packet.id);
    expect(undetailed).toEqual([]);
  });

  it.each(detailed.map((packet) => [packet.id, packet] as const))(
    '%s maps every handle to exactly one step, in order',
    (_id, packet) => {
      const stepHandles = [...packet.steps.matchAll(/^\d+\. `([a-z0-9-]+)` —/gm)].map((match) => match[1]);
      expect(stepHandles).toEqual(packet.handles ?? []);
    }
  );

  it('gives one step per handle across the whole plan', () => {
    const handles = packets.reduce((total, packet) => total + (packet.handles ?? []).length, 0);
    const steps = packets.reduce((total, packet) => total + [...packet.steps.matchAll(/^\d+\. `[a-z0-9-]+` —/gm)].length, 0);
    console.log(`detail pass: ${detailed.length}/${packets.length} packets, ${steps}/${handles} handles detailed`);
    expect(steps).toBe(handles);
  });
});
