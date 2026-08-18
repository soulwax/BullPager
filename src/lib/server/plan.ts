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
 * rather than silently truncated — see BUILD_MASTERPLAN.md §B.3 (B3-1). */
export const MAX_PACKET_HANDLES = 40;
export const MAX_PACKET_TAGS = 12;
/** The "right-sized" band from BUILD_MASTERPLAN.md §B.2: fewer means a packet
 * is under-sliced (a handle isn't really one sitting); more means it should
 * be split into two packets rather than growing past MAX_PACKET_HANDLES. */
export const MIN_RIGHTSIZED_HANDLES = 4;
export const MAX_RIGHTSIZED_HANDLES = 20;
/** BUILD_MASTERPLAN.md §B.2's typed-kind grammar: `u<milestone>-<scope>-<slice>-<kind>`. */
const HANDLE_KINDS = ['decide', 'spike', 'schema', 'rule', 'port', 'adapter', 'bind', 'scene', 'asset', 'fixture', 'test', 'route', 'capture', 'review', 'guard', 'doc'] as const;
const handlePattern = new RegExp(`^u([0-6])-([a-z0-9]+)-[a-z0-9]+(?:-[a-z0-9]+){0,3}-(?:${HANDLE_KINDS.join('|')})$`);

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

/** Categories where a visible/experiential change means a model's judgment
 * is not enough to close the packet — BUILD_MASTERPLAN.md §B.2's mandatory
 * `review` handle rule, mirroring MASTERPLAN.md §9.2's human-eyes gate. */
const REVIEW_REQUIRED_CATEGORIES = new Set(['House and spatial world', 'UI, input, and accessibility', 'Rendering and presentation']);

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
    if (!packet.runbook?.trim()) errors.push(`${packet.id} has no runbook; add ordered implementation instructions.`);
    const handles = packet.handles ?? [];
    if (!handles.length) {
      errors.push(`${packet.id} has no handles; add one or more milestone-prefixed implementation slices.`);
      continue;
    }
    if (handles.length > MAX_PACKET_HANDLES) errors.push(`${packet.id} has ${handles.length} handles, over the ${MAX_PACKET_HANDLES} cap; split the packet instead of adding more handles to one card.`);
    else if (handles.length < MIN_RIGHTSIZED_HANDLES || handles.length > MAX_RIGHTSIZED_HANDLES) errors.push(`${packet.id} has ${handles.length} handles, outside the ${MIN_RIGHTSIZED_HANDLES}-${MAX_RIGHTSIZED_HANDLES} right-sized band; under-sliced handles aren't one sitting, and a packet needing more should split (BUILD_MASTERPLAN.md §B.5).`);
    const expectedMilestoneDigit = milestoneFor(packet.id).replace('U', '');
    const scopes = new Set<string>();
    const kinds = new Set<string>();
    for (const handle of handles) {
      const match = handle.match(handlePattern);
      if (!match) { errors.push(`${packet.id} has invalid handle ${handle}; expected u<milestone>-<scope>-<slice>-<kind>.`); continue; }
      const [, milestoneDigit, scope] = match;
      if (milestoneDigit !== expectedMilestoneDigit) errors.push(`${packet.id} handle ${handle} is milestoned u${milestoneDigit}, but the packet belongs to ${milestoneFor(packet.id)}.`);
      scopes.add(scope);
      kinds.add(handle.slice(handle.lastIndexOf('-') + 1));
    }
    if (scopes.size > 1) errors.push(`${packet.id} handles use inconsistent scopes (${[...scopes].join(', ')}); every handle in one packet shares the same scope token.`);
    if (REVIEW_REQUIRED_CATEGORIES.has(packet.category ?? '') && !kinds.has('review')) errors.push(`${packet.id} is in a visible-change category (${packet.category}) and needs at least one -review handle before it can close on more than a model's judgment.`);
  }
  for (const packet of packets) {
    for (const dependency of packet.dependsOn) {
      if (!seen.has(dependency)) errors.push(`${packet.id} depends on missing packet ${dependency}.`);
    }
  }
  return errors;
}

// An explicit table, not a numeric-range heuristic: MIG-04 (U0) and MIG-14
// (U2) both break a range formula, and only the ledger in UNITY_PLAN.md §11
// is authoritative for which milestone a packet belongs to.
const MILESTONE_BY_PACKET: Record<string, string> = {
  'MIG-00': 'U0', 'MIG-01': 'U0', 'MIG-04': 'U0', 'MIG-05': 'U0',
  'MIG-02': 'U1', 'MIG-03': 'U1', 'MIG-10': 'U1', 'MIG-11': 'U1', 'MIG-12': 'U1', 'MIG-13': 'U1',
  'MIG-14': 'U2', 'MIG-20': 'U2', 'MIG-21': 'U2', 'MIG-22': 'U2', 'MIG-23': 'U2',
  'MIG-30': 'U3', 'MIG-31': 'U3', 'MIG-32': 'U3', 'MIG-33': 'U3', 'MIG-40': 'U3',
  'MIG-60': 'U4', 'MIG-61': 'U4',
  'MIG-50': 'U5', 'MIG-51': 'U5', 'MIG-52': 'U5', 'MIG-62': 'U5',
  'MIG-70': 'U6'
};

function milestoneFor(id: string): string {
  return MILESTONE_BY_PACKET[id] ?? 'U0';
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
