import { describe, expect, it } from 'vitest';
import {
  isValidPageId,
  pageFolder,
  pageIdFor,
  pageIdFromPath,
  pageKey,
  parseWikiFile,
  serializeWikiFile,
  titleFor,
  wikiPathFor,
  WIKI_ROOT
} from '../src/lib/wikiFiles';

describe('path mapping', () => {
  it('round-trips a page id through its file path', () => {
    for (const id of ['runbook', 'scaffolding/pages/etc', 'a/b/c/d']) {
      expect(pageIdFromPath(wikiPathFor(id))).toBe(id);
    }
  });

  it('stores pages under the wiki root so the cloud groups them', () => {
    expect(wikiPathFor('runbook')).toBe(`${WIKI_ROOT}/runbook.md`);
  });

  it('ignores files that are not wiki markdown', () => {
    expect(pageIdFromPath('notes/runbook.md')).toBeNull();
    expect(pageIdFromPath('wiki/diagram.png')).toBeNull();
    expect(pageIdFromPath('wiki/.md')).toBeNull();
    expect(pageIdFromPath('wiki')).toBeNull();
  });

  it('accepts an uppercase extension, since a hand-added file may use one', () => {
    expect(pageIdFromPath('wiki/Runbook.MD')).toBe('Runbook');
  });
});

describe('pageIdFor', () => {
  it('slugs each segment while keeping the folder structure', () => {
    expect(pageIdFor('Scaffolding/Pages/Etc')).toBe('scaffolding/pages/etc');
    expect(pageIdFor('Deployment Runbook')).toBe('deployment-runbook');
  });

  it('drops empty segments from sloppy input', () => {
    expect(pageIdFor('/a//b/')).toBe('a/b');
  });

  it('agrees with how a wiki link is slugged, so both find one page', () => {
    expect(pageIdFor('Deployment  RUNBOOK')).toBe('deployment-runbook');
  });
});

describe('isValidPageId', () => {
  it('accepts what pageIdFor produces', () => {
    expect(isValidPageId('deployment-runbook')).toBe(true);
    expect(isValidPageId('scaffolding/pages/etc')).toBe(true);
  });

  it('rejects traversal, absolute paths, and empty ids', () => {
    expect(isValidPageId('../secrets')).toBe(false);
    expect(isValidPageId('/etc/passwd')).toBe(false);
    expect(isValidPageId('')).toBe(false);
  });

  it('bounds nesting depth and total length', () => {
    expect(isValidPageId('a/b/c/d/e/f/g')).toBe(false);
    expect(isValidPageId('x'.repeat(200))).toBe(false);
  });
});

describe('front matter', () => {
  it('reads title and pinned, and returns the body without the block', () => {
    const { meta, body } = parseWikiFile('---\ntitle: Deployment runbook\npinned: true\n---\n\nBody text.\n');
    expect(meta).toEqual({ title: 'Deployment runbook', pinned: true });
    expect(body).toBe('Body text.\n');
  });

  it('treats a file with no front matter as all body', () => {
    expect(parseWikiFile('# Just a heading\n')).toEqual({ meta: {}, body: '# Just a heading\n' });
  });

  it('degrades to no metadata on a malformed block rather than throwing', () => {
    const { meta, body } = parseWikiFile('---\nthis is not: valid: yaml: at all\n---\nBody\n');
    expect(meta).toEqual({});
    expect(body).toBe('Body\n');
  });

  it('ignores keys it does not own', () => {
    const { meta } = parseWikiFile('---\ntitle: A\nauthor: someone\n---\nB\n');
    expect(meta).toEqual({ title: 'A' });
  });

  it('strips surrounding quotes from a value', () => {
    expect(parseWikiFile('---\ntitle: "Quoted"\n---\nx').meta.title).toBe('Quoted');
  });
});

describe('serializeWikiFile', () => {
  it('writes a plain markdown file when the heading already says the title', () => {
    const out = serializeWikiFile({ title: 'Runbook', body: '# Runbook\n\nHow we ship.\n' });
    expect(out).toBe('# Runbook\n\nHow we ship.\n');
    expect(out).not.toContain('---');
  });

  it('adds front matter only when the body cannot carry the title', () => {
    const out = serializeWikiFile({ title: 'Runbook', body: 'No heading here.\n' });
    expect(out.startsWith('---\ntitle: Runbook\n---\n')).toBe(true);
  });

  it('records pinned even when the heading matches', () => {
    const out = serializeWikiFile({ title: 'Runbook', pinned: true, body: '# Runbook\n' });
    expect(out).toContain('pinned: true');
    expect(out).not.toContain('title:');
  });

  it('round-trips through the parser', () => {
    const written = serializeWikiFile({ title: 'Odd Title', pinned: true, body: '# Different\n\nBody.\n' });
    const { meta, body } = parseWikiFile(written);
    expect(meta).toEqual({ title: 'Odd Title', pinned: true });
    expect(body.trim()).toBe('# Different\n\nBody.'.trim());
  });

  it('always ends with a newline, so the file is well-formed for a text editor', () => {
    expect(serializeWikiFile({ title: 'A', body: '# A\n\nno trailing newline' }).endsWith('\n')).toBe(true);
  });
});

describe('titleFor', () => {
  it('prefers front matter, then a heading, then the filename', () => {
    expect(titleFor('x', { title: 'From meta' }, '# From heading')).toBe('From meta');
    expect(titleFor('x', {}, '# From heading')).toBe('From heading');
    expect(titleFor('deployment-runbook', {}, 'no heading')).toBe('Deployment runbook');
  });

  it('titles a nested page from its own filename, not its folder', () => {
    expect(titleFor('scaffolding/pages/etc', {}, '')).toBe('Etc');
  });

  it('never returns empty for a file dropped in by hand', () => {
    expect(titleFor('notes', {}, '')).toBeTruthy();
  });
});

describe('pageKey and pageFolder', () => {
  it('splits a nested id into its link key and its folder', () => {
    expect(pageKey('scaffolding/pages/etc')).toBe('etc');
    expect(pageFolder('scaffolding/pages/etc')).toBe('scaffolding/pages');
  });

  it('reports a root page as having no folder', () => {
    expect(pageFolder('runbook')).toBe('');
    expect(pageKey('runbook')).toBe('runbook');
  });
});
