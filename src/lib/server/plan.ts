import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Packet, PacketState, PlanView } from '$lib/types';
import { loadBoardSettings, loadPacketNotes, loadPersistedTransitions, loadTransitionHistory, overlayTransitions } from '$lib/server/persistence';
import unitySnapshot from '../../../content/UNITY_PLAN.md?raw';
import guideSnapshot from '../../../content/HUMAN_AGILE_GUIDE.md?raw';

const states: PacketState[] = ['OPEN', 'ACTIVE', 'PARTIAL', 'BLOCKED', 'CLOSED', 'DROPPED'];
const packetHeading = /^###\s+(MIG-[0-9]+)\s+—\s+(.+)$/;
/** A packet whose source line exceeds this is rejected by `validatePackets`
 * rather than silently truncated — see BUILD_MASTERPLAN.md §B.3 (B3-1). The
 * grammar stays the lenient `u<0-6>-<slug>` form used by the shipped plan
 * today; BUILD_MASTERPLAN.md §B.2's typed-kind grammar is a future tightening
 * that must land together with a rewrite of every packet's `Handles:` line. */
export const MAX_PACKET_HANDLES = 40;
export const MAX_PACKET_TAGS = 12;

function field(block: string, name: string): string {
  const match = block.match(new RegExp(`^${name}:\\s*(.*(?:\\n(?![A-Za-z ]+:).*)*)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

export function parsePackets(markdown: string): Packet[] {
  const lines = markdown.split(/\r?\n/);
  const packets: Packet[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(packetHeading);
    if (!heading) continue;
    let end = index + 1;
    while (end < lines.length && !packetHeading.test(lines[end])) end += 1;
    const block = lines.slice(index + 1, end).join('\n');
    const state = field(block, 'State') as PacketState;
    const depends = field(block, 'Depends on');
    packets.push({
      id: heading[1],
      title: heading[2].trim(),
      state: states.includes(state) ? state : 'OPEN',
      owner: field(block, 'Owner') || 'unassigned',
      category: field(block, 'Category') || 'Uncategorized',
      subcategory: field(block, 'Subcategory') || 'General',
      tags: [...new Set(field(block, 'Tags').split(',').map((tag) => tag.trim().toLowerCase()).filter((tag) => tag && tag !== 'none'))].slice(0, MAX_PACKET_TAGS),
      // Not capped here: a packet exceeding MAX_PACKET_HANDLES must fail
      // validation below, not silently lose handles off the end of the list.
      handles: [...new Set(field(block, 'Handles').split(',').map((handle) => handle.trim().toLowerCase()).filter(Boolean))],
      runbook: field(block, 'Runbook'),
      dependsOn: depends && depends.toLowerCase() !== 'none'
        ? [...depends.matchAll(/MIG-\d+/g)].map((match) => match[0])
        : [],
      milestone: milestoneFor(heading[1]),
      outcome: field(block, 'Outcome'),
      inputs: field(block, 'Inputs'),
      files: field(block, 'Files'),
      doNotTouch: field(block, 'Do not touch'),
      checks: field(block, 'Checks'),
      evidence: field(block, 'Evidence'),
      remainder: field(block, 'Remainder'),
      steps: field(block, 'Steps')
    });
    index = end - 1;
  }
  return packets;
}

export function validatePackets(packets: Packet[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const packet of packets) {
    if (seen.has(packet.id)) errors.push(`Duplicate packet ID: ${packet.id}.`);
    seen.add(packet.id);
    if (!packet.title.trim()) errors.push(`${packet.id} has no title.`);
    if (!packet.category?.trim()) errors.push(`${packet.id} has no category.`);
    if (!packet.subcategory?.trim()) errors.push(`${packet.id} has no subcategory.`);
    if (!packet.tags?.length) errors.push(`${packet.id} has no tags; use at least one capability label.`);
    if (!packet.handles?.length) errors.push(`${packet.id} has no handles; add one or more milestone-prefixed implementation slices.`);
    if ((packet.handles?.length ?? 0) > MAX_PACKET_HANDLES) errors.push(`${packet.id} has ${packet.handles!.length} handles, over the ${MAX_PACKET_HANDLES} cap; split the packet instead of adding more handles to one card.`);
    if (!packet.runbook?.trim()) errors.push(`${packet.id} has no runbook; add ordered implementation instructions.`);
    for (const handle of packet.handles ?? []) {
      if (!/^u[0-6]-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) errors.push(`${packet.id} has invalid handle ${handle}.`);
    }
  }
  for (const packet of packets) {
    for (const dependency of packet.dependsOn) {
      if (!seen.has(dependency)) errors.push(`${packet.id} depends on missing packet ${dependency}.`);
    }
  }
  return errors;
}

function milestoneFor(id: string): string {
  const numeric = Number(id.slice(4));
  if (numeric === 0 || numeric === 1 || numeric === 5) return 'U0';
  if (numeric < 20) return 'U1';
  if (numeric < 30) return 'U2';
  if (numeric < 50) return 'U3';
  if (numeric < 60) return 'U5';
  if (numeric < 62) return 'U4';
  if (numeric < 70) return 'U5';
  return 'U6';
}

function readyIds(packets: Packet[]): string[] {
  const byId = new Map(packets.map((packet) => [packet.id, packet]));
  return packets
    .filter((packet) => packet.state === 'OPEN' && packet.dependsOn.every((id) => byId.get(id)?.state === 'CLOSED'))
    .map((packet) => packet.id);
}

export async function loadPlan(): Promise<PlanView> {
  const { unityPath, guidePath } = sourcePaths();
  const errors: string[] = [];
  let packets: Packet[] = [];
  let transitionHistory = [] as Awaited<ReturnType<typeof loadTransitionHistory>>;
  let packetNotes = [] as Awaited<ReturnType<typeof loadPacketNotes>>;
  let projectSettings: Record<string, string> = {};
  let planDigest: string | undefined;
  try {
    const [unity, guide] = await readSources();
    planDigest = sourceDigest(unity);
    packets = overlayTransitions(parsePackets(unity), await loadPersistedTransitions());
    transitionHistory = await loadTransitionHistory();
    packetNotes = await loadPacketNotes();
    const allSettings = await loadBoardSettings();
    projectSettings = Object.fromEntries(Object.entries(allSettings).filter(([key]) => key.startsWith('project_unity_')));
    // The board slug contains a hyphen, while the legacy plan view used an
    // underscore prefix. Expose both under the legacy view key without
    // overwriting an explicitly configured plan-view setting.
    const projectPrefix = 'project_unity-plan_';
    for (const [key, value] of Object.entries(allSettings)) {
      if (!key.startsWith(projectPrefix)) continue;
      const normalized = `project_unity_${key.slice(projectPrefix.length)}`;
      if (!(normalized in projectSettings)) projectSettings[normalized] = value;
    }
    if (!guide.includes('HUMAN AGILE GUIDE')) errors.push('The operating guide marker was not found.');
    if (packets.length === 0) errors.push('No Unity implementation packets were found.');
    errors.push(...validatePackets(packets));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unable to read plan sources.');
  }
  const stateCounts = Object.fromEntries(states.map((state) => [state, packets.filter((packet) => packet.state === state).length])) as Record<PacketState, number>;
  return {
    valid: errors.length === 0,
    sourceMode: env.VERCEL ? 'hosted read-only snapshot' : 'local authority files',
    errors,
    guidePath,
    unityPath,
    packets,
    stateCounts,
    readyIds: readyIds(packets),
    transitionHistory,
    packetNotes,
    projectSettings,
    sourceDigest: planDigest
  };
}

export function sourcePaths() {
  const deployed = Boolean(env.VERCEL);
  return {
    unityPath: resolve(env.HAP_UNITY_PATH || (deployed ? 'content/UNITY_PLAN.md' : '../../UNITY_PLAN.md')),
    guidePath: resolve(env.HAP_GUIDE_PATH || (deployed ? 'content/HUMAN_AGILE_GUIDE.md' : '../../external/docs/HUMAN_AGILE_GUIDE.md'))
  };
}

export async function readSources() {
  if (env.VERCEL) return [unitySnapshot, guideSnapshot] as const;
  const { unityPath, guidePath } = sourcePaths();
  return Promise.all([readFile(unityPath, 'utf8'), readFile(guidePath, 'utf8')]);
}

export function sourceDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
