import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Packet, PacketState, PlanView } from '$lib/types';
import unitySnapshot from '../../../content/UNITY_PLAN.md?raw';
import guideSnapshot from '../../../content/HUMAN_AGILE_GUIDE.md?raw';

const states: PacketState[] = ['OPEN', 'ACTIVE', 'PARTIAL', 'BLOCKED', 'CLOSED', 'DROPPED'];
const packetHeading = /^###\s+(MIG-[0-9]+)\s+—\s+(.+)$/;

function field(block: string, name: string): string {
  const match = block.match(new RegExp(`^${name}:\\s*(.*(?:\\n(?![A-Za-z ]+:).*)*)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

function parsePackets(markdown: string): Packet[] {
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

function milestoneFor(id: string): string {
  const numeric = Number(id.slice(4));
  if (numeric === 0 || numeric === 1 || numeric === 5) return 'U0';
  if (numeric < 20) return 'U1';
  if (numeric < 30) return 'U2';
  if (numeric < 50) return 'U3';
  if (numeric < 60) return 'U6';
  if (numeric < 70) return 'U5–U6';
  return 'U7';
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
  try {
    const [unity, guide] = await readSources();
    packets = parsePackets(unity);
    if (!guide.includes('HUMAN AGILE GUIDE')) errors.push('The operating guide marker was not found.');
    if (packets.length === 0) errors.push('No migration packets were found.');
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
    readyIds: readyIds(packets)
  };
}

export function sourcePaths() {
  const deployed = Boolean(env.VERCEL);
  return {
    unityPath: resolve(env.HAP_UNITY_PATH || (deployed ? 'content/UNITY_PLAN.md' : '../../UNITY_PLAN.md')),
    guidePath: resolve(env.HAP_GUIDE_PATH || (deployed ? 'content/HUMAN_AGILE_GUIDE.md' : '../../tmp/HUMAN_AGILE_GUIDE.md'))
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
