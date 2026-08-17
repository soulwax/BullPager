import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPreview, buildProposedSource, replaceValidated, validateTransition } from '../src/lib/server/transition';
import type { Packet } from '../src/lib/types';

const packet: Packet = {
  id: 'MIG-00', title: 'Record the transition charter', state: 'OPEN', owner: 'unassigned',
  dependsOn: [], milestone: 'U0', outcome: 'A charter.', inputs: 'Plan.', files: 'Docs.', doNotTouch: 'Code.', checks: 'Review.', evidence: 'none', remainder: 'none', steps: 'Do it.'
};

describe('transition preview', () => {
  it('requires evidence before closing', () => {
    const errors = validateTransition(packet, { packetId: packet.id, nextState: 'CLOSED', owner: '', evidence: '', remainder: '' }, true);
    expect(errors).toContain('A completed packet needs evidence.');
  });

  it('changes only the selected packet block and never writes', () => {
    const source = '### MIG-00 — Record the transition charter\nID: MIG-00\nState: OPEN\nOwner: unassigned\nEvidence: none\nRemainder: none\n\n### MIG-01 — Another packet\nState: OPEN\n\n| MIG-00 | OPEN | unassigned | U0 | none |';
    const preview = buildPreview(source, packet, { packetId: packet.id, nextState: 'ACTIVE', owner: 'Ada', evidence: '', remainder: '' }, true);
    expect(preview.diff).toContain('+State: ACTIVE');
    expect(preview.diff).toContain('+Owner: Ada');
    expect(preview.diff.match(/^[+-](State|Owner):/gm)).toHaveLength(4);
    expect(source).toContain('State: OPEN');
  });

  it('synchronizes the selected ledger row in the proposal', () => {
    const source = '### MIG-00 — Record the transition charter\nID: MIG-00\nState: OPEN\nOwner: unassigned\nEvidence: none\nRemainder: none\n\n| MIG-00 | OPEN | unassigned | U0 | none |';
    const proposed = buildProposedSource(source, packet, { packetId: packet.id, nextState: 'ACTIVE', owner: 'Ada', evidence: 'check-1', remainder: '' }, true);
    expect(proposed).toContain('| MIG-00 | ACTIVE | Ada | U0 | check-1 |');
  });

  it('validates and atomically replaces a temporary target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'project-agile-'));
    const target = join(directory, 'plan.md');
    await writeFile(target, 'before', 'utf8');
    await replaceValidated(target, 'after', async (temporary) => {
      expect(await readFile(temporary, 'utf8')).toBe('after');
    });
    expect(await readFile(target, 'utf8')).toBe('after');
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    await rm(directory, { recursive: true, force: true });
  });
});
