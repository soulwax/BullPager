import { describe, expect, it } from 'vitest';
import { sourceDigest, sourcePaths } from '../src/lib/server/plan';

describe('plan helpers', () => {
  it('creates stable SHA-256 digests', () => {
    expect(sourceDigest('project-plan')).toBe(sourceDigest('project-plan'));
    expect(sourceDigest('project-plan')).not.toBe(sourceDigest('changed'));
  });

  it('uses the docs submodule for local authority files', () => {
    expect(sourcePaths().guidePath).toContain('/external/docs/HUMAN_AGILE_GUIDE.md');
  });
});
