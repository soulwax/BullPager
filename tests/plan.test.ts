import { describe, expect, it } from 'vitest';
import { sourceDigest } from '../src/lib/server/plan';

describe('plan helpers', () => {
  it('creates stable SHA-256 digests', () => {
    expect(sourceDigest('project-plan')).toBe(sourceDigest('project-plan'));
    expect(sourceDigest('project-plan')).not.toBe(sourceDigest('changed'));
  });
});
