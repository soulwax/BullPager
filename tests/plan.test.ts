import { describe, expect, it } from 'vitest';
import { parsePackets, sourceDigest, sourcePaths, validatePackets } from '../src/lib/server/plan';
import unitySnapshot from '../content/UNITY_PLAN.md?raw';

describe('plan helpers', () => {
  it('creates stable SHA-256 digests', () => {
    expect(sourceDigest('project-plan')).toBe(sourceDigest('project-plan'));
    expect(sourceDigest('project-plan')).not.toBe(sourceDigest('changed'));
  });

  it('uses the docs submodule for local authority files', () => {
    expect(sourcePaths().guidePath).toContain('/external/docs/HUMAN_AGILE_GUIDE.md');
  });

  it('keeps greenfield taxonomy available to database sync', () => {
    const [packet] = parsePackets(`### MIG-00 — Build the foundation
State: OPEN
Owner: unassigned
Category: Foundation and project operations
Subcategory: Project scaffold and CI
Tags: greenfield, unity, ci
Handles: u0-unity-project, u0-ci-build
Runbook:
1. Create the pinned Unity project in the approved folder.
2. Run the smoke test and preserve its output.
Depends on: None
Outcome: A clean Unity project.
Steps: 1. Create it.`);
    expect(packet).toMatchObject({
      id: 'MIG-00',
      category: 'Foundation and project operations',
      subcategory: 'Project scaffold and CI',
      tags: ['greenfield', 'unity', 'ci'],
      handles: ['u0-unity-project', 'u0-ci-build'],
      runbook: '1. Create the pinned Unity project in the approved folder.\n2. Run the smoke test and preserve its output.'
    });
  });

  it('rejects duplicate IDs and missing dependencies before sync', () => {
    const packets = parsePackets(`### MIG-00 — Foundation
State: OPEN
Owner: unassigned
Category: Foundation
Subcategory: Scaffold
Depends on: MIG-99

### MIG-00 — Duplicate
State: OPEN
Owner: unassigned
Category: Foundation
Subcategory: Scaffold
Depends on: none`);
    expect(validatePackets(packets)).toEqual(expect.arrayContaining([
      'Duplicate packet ID: MIG-00.',
      'MIG-00 depends on missing packet MIG-99.'
    ]));
  });

  it('maps implementation packets to the documented milestones', () => {
    const packets = parsePackets(`### MIG-50 — Assets
State: OPEN
Owner: unassigned
Category: World
Subcategory: Assets
Depends on: none

### MIG-60 — Campaign
State: OPEN
Owner: unassigned
Category: Story
Subcategory: Campaign
Depends on: MIG-50

### MIG-62 — Voice
State: OPEN
Owner: unassigned
Category: Audio
Subcategory: Voice
Depends on: MIG-60`);
    expect(packets.map((packet) => packet.milestone)).toEqual(['U5', 'U4', 'U5']);
  });

  it('keeps the shipped Unity plan internally consistent', () => {
    const packets = parsePackets(unitySnapshot);
    expect(packets).toHaveLength(27);
    expect(packets.every((packet) => (packet.tags?.length ?? 0) > 0)).toBe(true);
    expect(packets.every((packet) => (packet.handles?.length ?? 0) > 0)).toBe(true);
    expect(packets.every((packet) => packet.runbook?.trim())).toBe(true);
    expect(validatePackets(packets)).toEqual([]);
  });
});
