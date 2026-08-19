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
    const [packet] = parsePackets(`### WARD-00 — Build the foundation
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
      id: 'WARD-00',
      category: 'Foundation and project operations',
      subcategory: 'Project scaffold and CI',
      tags: ['greenfield', 'unity', 'ci'],
      handles: ['u0-unity-project', 'u0-ci-build'],
      runbook: '1. Create the pinned Unity project in the approved folder.\n2. Run the smoke test and preserve its output.'
    });
  });

  it('rejects duplicate IDs and missing dependencies before sync', () => {
    const packets = parsePackets(`### WARD-00 — Foundation
State: OPEN
Owner: unassigned
Category: Foundation
Subcategory: Scaffold
Depends on: WARD-99

### WARD-00 — Duplicate
State: OPEN
Owner: unassigned
Category: Foundation
Subcategory: Scaffold
Depends on: none`);
    expect(validatePackets(packets)).toEqual(expect.arrayContaining([
      'Duplicate packet ID: WARD-00.',
      'WARD-00 depends on missing packet WARD-99.'
    ]));
  });

  it('maps implementation packets to the documented milestones', () => {
    const packets = parsePackets(`### WARD-50 — Assets
State: OPEN
Owner: unassigned
Category: World
Subcategory: Assets
Depends on: none

### WARD-60 — Campaign
State: OPEN
Owner: unassigned
Category: Story
Subcategory: Campaign
Depends on: WARD-50

### WARD-62 — Voice
State: OPEN
Owner: unassigned
Category: Audio
Subcategory: Voice
Depends on: WARD-60`);
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

  it('fixes WARD-04 and WARD-14 to the ledger milestone rather than a numeric-range guess', () => {
    // WARD-04 (sync, numeric 4) and WARD-14 (save, numeric 14) both break a
    // clean numeric-range formula against UNITY_PLAN.md §11's ledger — U0 and
    // U2 respectively, not U1. Only an explicit table gets these right.
    const packets = parsePackets(unitySnapshot);
    const byId = new Map(packets.map((packet) => [packet.id, packet.milestone]));
    expect(byId.get('WARD-04')).toBe('U0');
    expect(byId.get('WARD-14')).toBe('U2');
  });

  it('rejects a handle that does not match u<milestone>-<scope>-<slice>-<kind>', () => {
    const packets = parsePackets(`### WARD-00 — Foundation
State: OPEN
Owner: unassigned
Category: Foundation and project operations
Subcategory: Scaffold
Tags: greenfield
Handles: u0-charter-nokind
Runbook: 1. Do it.
Depends on: none
Steps: 1. Do it.`);
    expect(validatePackets(packets)).toEqual(expect.arrayContaining([
      expect.stringContaining('u0-charter-nokind')
    ]));
  });

  it('rejects handles whose milestone digit disagrees with the packet ledger', () => {
    const packets = parsePackets(`### WARD-00 — Foundation
State: OPEN
Owner: unassigned
Category: Foundation and project operations
Subcategory: Scaffold
Tags: greenfield
Handles: u2-charter-authority-doc, u0-charter-review-review
Runbook: 1. Do it.
Depends on: none
Steps: 1. Do it.`);
    expect(validatePackets(packets)).toEqual(expect.arrayContaining([
      expect.stringContaining('is milestoned u2')
    ]));
  });

  it('rejects handles that mix more than one scope token in a packet', () => {
    const packets = parsePackets(`### WARD-00 — Foundation
State: OPEN
Owner: unassigned
Category: Foundation and project operations
Subcategory: Scaffold
Tags: greenfield
Handles: u0-charter-authority-doc, u0-other-side-quest-rule
Runbook: 1. Do it.
Depends on: none
Steps: 1. Do it.`);
    expect(validatePackets(packets)).toEqual(expect.arrayContaining([
      expect.stringContaining('inconsistent scopes')
    ]));
  });

  it('rejects a packet outside the 4-20 right-sized handle band', () => {
    const packets = parsePackets(`### WARD-00 — Foundation
State: OPEN
Owner: unassigned
Category: Foundation and project operations
Subcategory: Scaffold
Tags: greenfield
Handles: u0-charter-authority-doc, u0-charter-editor-decide
Runbook: 1. Do it.
Depends on: none
Steps: 1. Do it.`);
    expect(validatePackets(packets)).toEqual(expect.arrayContaining([
      expect.stringContaining('outside the 4-20 right-sized band')
    ]));
  });

  it('requires a -review handle for visible-change categories', () => {
    const packets = parsePackets(`### WARD-20 — Build the greybox
State: OPEN
Owner: unassigned
Category: House and spatial world
Subcategory: Room graph
Tags: world
Handles: u2-world-a-scene, u2-world-b-rule, u2-world-c-rule, u2-world-d-rule
Runbook: 1. Do it.
Depends on: none
Steps: 1. Do it.`);
    expect(validatePackets(packets)).toEqual(expect.arrayContaining([
      expect.stringContaining('needs at least one -review handle')
    ]));
  });
});
