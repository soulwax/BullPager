import { createTwoFilesPatch } from 'diff';
import type { Packet, PacketState, TransitionPreview } from '$lib/types';

const states: PacketState[] = ['OPEN', 'ACTIVE', 'PARTIAL', 'BLOCKED', 'CLOSED', 'DROPPED'];

export type TransitionRequest = {
  packetId: string;
  nextState: PacketState;
  owner: string;
  evidence: string;
  remainder: string;
};

export function validateTransition(packet: Packet, request: TransitionRequest, ready: boolean): string[] {
  const errors: string[] = [];
  if (!states.includes(request.nextState)) errors.push('Choose a supported state.');
  if (request.nextState === packet.state) errors.push('Choose a state different from the current state.');
  if (['ACTIVE', 'PARTIAL', 'BLOCKED'].includes(request.nextState) && !request.owner.trim()) {
    errors.push('An active packet needs an assigned contributor.');
  }
  if (request.nextState === 'ACTIVE' && !ready) errors.push('All dependencies must be closed before activation.');
  if (request.nextState === 'CLOSED' && !request.evidence.trim()) errors.push('A completed packet needs evidence.');
  if (['PARTIAL', 'BLOCKED'].includes(request.nextState) && !request.remainder.trim()) {
    errors.push(`${request.nextState} work needs a precise remainder or blocker.`);
  }
  return errors;
}

function replaceField(source: string, name: string, value: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}:.*$`, 'm');
  if (!pattern.test(source)) return source;
  return source.replace(pattern, `${name}: ${value.trim() || 'none'}`);
}

export function buildPreview(source: string, packet: Packet, request: TransitionRequest, ready: boolean): TransitionPreview {
  const errors = validateTransition(packet, request, ready);
  if (errors.length) throw new Error(errors.join(' '));
  const heading = `### ${packet.id} — ${packet.title}`;
  const start = source.indexOf(heading);
  const end = source.indexOf('\n### MIG-', start + heading.length);
  if (start < 0) throw new Error(`Packet ${packet.id} was not found in the source text.`);
  const boundary = end < 0 ? source.length : end;
  let block = source.slice(start, boundary);
  block = replaceField(block, 'State', request.nextState);
  block = replaceField(block, 'Owner', request.owner);
  block = replaceField(block, 'Evidence', request.evidence);
  block = replaceField(block, 'Remainder', request.remainder);
  const proposed = `${source.slice(0, start)}${block}${source.slice(boundary)}`;
  const diff = createTwoFilesPatch('UNITY_PLAN.md', 'UNITY_PLAN.md', source, proposed, 'current', 'preview', { context: 3 });
  return { packetId: packet.id, nextState: request.nextState, diff, message: 'Preview generated in memory. No source file was changed.' };
}
