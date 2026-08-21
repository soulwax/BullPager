import { describe, expect, it } from 'vitest';
import { wikiSeedFor } from '../src/lib/wikiScaffold';
import { projectTemplates } from '../src/lib/projectTemplates';
import { isValidPageId, parseWikiFile, serializeWikiFile, titleFor } from '../src/lib/wikiFiles';
import { missingPages, parseCardRefs } from '../src/lib/wikiLinks';

const templateIds = projectTemplates.map((template) => template.id);

describe('wikiSeedFor', () => {
  it('covers every template that exists, not just the ones it was written for', () => {
    for (const id of templateIds) {
      expect(wikiSeedFor(id, 'Demo').length, id).toBeGreaterThan(1);
    }
  });

  it('falls back to a usable page for a template id it has never seen', () => {
    const pages = wikiSeedFor('not-a-template', 'Demo');
    expect(pages.map((page) => page.id)).toContain('home');
    expect(pages.map((page) => page.id)).toContain('how-this-wiki-works');
  });

  it('always includes the guide, so no project starts without an explanation', () => {
    for (const id of templateIds) {
      expect(wikiSeedFor(id, 'Demo').some((page) => page.id === 'how-this-wiki-works'), id).toBe(true);
    }
  });

  it('produces page ids the file store will accept', () => {
    for (const id of templateIds) {
      for (const page of wikiSeedFor(id, 'Demo')) {
        expect(isValidPageId(page.id), `${id}/${page.id}`).toBe(true);
      }
    }
  });

  it('never emits the same page twice, which would collide on (slug, path)', () => {
    for (const id of templateIds) {
      const ids = wikiSeedFor(id, 'Demo').map((page) => page.id);
      expect(new Set(ids).size, id).toBe(ids.length);
    }
  });

  it('puts the project name in the home page', () => {
    const home = wikiSeedFor('software-delivery', 'Kestrel').find((page) => page.id === 'home');
    expect(home?.body).toContain('Kestrel');
  });
});

describe('a freshly seeded wiki', () => {
  // The point of the seed is that the wiki opens in a finished state. A
  // "Wanted pages" list on day one would be the wiki inventing chores for a
  // person who has not written anything yet.
  it('leaves nothing in the wanted-pages list', () => {
    for (const id of templateIds) {
      const pages = wikiSeedFor(id, 'Demo').map((page) => ({ slug: page.id, title: page.title, body: page.body }));
      expect(missingPages(pages).map((entry) => entry.slug), id).toEqual([]);
    }
  });

  it('teaches card references without actually citing a card that does not exist', () => {
    // The guide shows `[[#42]]` inside a fence. If the fence ever stopped being
    // honoured, every new project would open with two dead card chips.
    const guide = wikiSeedFor('blank-board', 'Demo').find((page) => page.id === 'how-this-wiki-works');
    expect(guide?.body).toContain('[[#42]]');
    expect(parseCardRefs(guide?.body ?? '')).toEqual([]);
  });

  it('survives the round trip through the file format it will be stored in', () => {
    for (const id of templateIds) {
      for (const page of wikiSeedFor(id, 'Demo')) {
        const stored = serializeWikiFile({ title: page.title, pinned: page.pinned, body: page.body });
        const read = parseWikiFile(stored);
        expect(titleFor(page.id, read.meta, read.body), `${id}/${page.id}`).toBe(page.title);
        expect(read.meta.pinned ?? false, `${id}/${page.id}`).toBe(page.pinned ?? false);
      }
    }
  });
});
