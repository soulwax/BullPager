import { describe, expect, it } from 'vitest';
import { buildPreview, validateTransition } from '../src/lib/server/transition';
import type { Packet } from '../src/lib/types';

const packet: Packet = {
  id: 'MIG-00', title: 'Record the transition charter', state: 'OPEN', owner: 'unassigned',
  dependsOn: [], milestone: 'U0', outcome: 'A charter.', checks: 'Review.', evidence: 'none', remainder: 'none', steps: 'Do it.'
};

describe('transition preview', () => {
  it('requires evidence before closing', () => {
    const errors = validateTransition(packet, { packetId: packet.id, nextState: 'CLOSED', owner: '', evidence: '', remainder: '' }, true);
    expect(errors).toContain('A completed packet needs evidence.');
  });

  it('changes only the selected packet block and never writes', () => {
    const source = '### MIG-00 — Record the transition charter\nID: MIG-00\nState: OPEN\nOwner: unassigned\nEvidence: none\nRemainder: none\n\n### MIG-01 — Another packet\nState: OPEN\n';
    const preview = buildPreview(source, packet, { packetId: packet.id, nextState: 'ACTIVE', owner: 'Ada', evidence: '', remainder: '' }, true);
    expect(preview.diff).toContain('+State: ACTIVE');
    expect(preview.diff).toContain('+Owner: Ada');
    expect(preview.diff.match(/^[+-](State|Owner):/gm)).toHaveLength(4);
    expect(source).toContain('State: OPEN');
  });
});
