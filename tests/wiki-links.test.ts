import { describe, expect, it } from 'vitest';
import {
  backlinksFor,
  parseCardRefs,
  isValidWikiSlug,
  missingPages,
  parseWikiLinks,
  renderWikiLinks,
  wikiExcerpt,
  wikiSlug
} from '../src/lib/wikiLinks';

const render = (body: string, known: string[] = []) =>
  renderWikiLinks(body, { basePath: '/projects/demo/wiki', exists: (slug) => known.includes(slug) });

describe('wikiSlug', () => {
  it('collapses case, punctuation, and whitespace so near-duplicates are one page', () => {
    const expected = 'deployment-runbook';
    for (const title of ['Deployment Runbook', 'deployment runbook', 'Deployment — Runbook!', '  DEPLOYMENT   runbook  ']) {
      expect(wikiSlug(title)).toBe(expected);
    }
  });

  it('strips accents rather than dropping the word', () => {
    expect(wikiSlug('Café notes')).toBe('cafe-notes');
  });

  it('never emits leading or trailing separators', () => {
    expect(wikiSlug('!!! hello !!!')).toBe('hello');
    expect(wikiSlug('...')).toBe('');
  });

  it('bounds the length so a pasted paragraph cannot become an address', () => {
    expect(wikiSlug('word '.repeat(60)).length).toBeLessThanOrEqual(80);
  });
});

describe('isValidWikiSlug', () => {
  it('accepts what wikiSlug produces and rejects what it never would', () => {
    expect(isValidWikiSlug('deployment-runbook')).toBe(true);
    expect(isValidWikiSlug('-leading')).toBe(false);
    expect(isValidWikiSlug('Upper')).toBe(false);
    expect(isValidWikiSlug('has space')).toBe(false);
    expect(isValidWikiSlug('')).toBe(false);
  });
});

describe('parseWikiLinks', () => {
  it('reads both the bare and the labelled form', () => {
    const links = parseWikiLinks('See [[Runbook]] and [[Deployment Runbook|the runbook]].');
    expect(links).toEqual([
      { target: 'Runbook', label: 'Runbook', slug: 'runbook' },
      { target: 'Deployment Runbook', label: 'the runbook', slug: 'deployment-runbook' }
    ]);
  });

  it('de-duplicates by slug, keeping the first occurrence', () => {
    const links = parseWikiLinks('[[Runbook]] then [[runbook|again]]');
    expect(links).toHaveLength(1);
    expect(links[0].label).toBe('Runbook');
  });

  it('ignores links inside fenced code — a sample is not a link', () => {
    const body = 'Real [[Alpha]]\n\n```md\n[[Beta]]\n```\n\nAlso `[[Gamma]]` inline.';
    expect(parseWikiLinks(body).map((link) => link.slug)).toEqual(['alpha']);
  });

  it('handles tilde fences as well as backtick fences', () => {
    expect(parseWikiLinks('~~~\n[[Beta]]\n~~~').map((l) => l.slug)).toEqual([]);
  });

  it('skips an empty target rather than emitting a link to nowhere', () => {
    expect(parseWikiLinks('[[   ]] and [[|label]]')).toEqual([]);
  });

  it('does not treat a card reference as a page link', () => {
    // Otherwise `[[#42]]` slugs to "42" and is reported as a page that should
    // be written, both here and in the index's wanted-pages list.
    expect(parseWikiLinks('[[#42]] and [[Runbook]]').map((link) => link.slug)).toEqual(['runbook']);
  });
});

describe('renderWikiLinks', () => {
  it('links an existing page to its address', () => {
    expect(render('see [[Runbook]]', ['runbook'])).toContain('href="/projects/demo/wiki/runbook"');
  });

  it('renders a link to a page nobody has written yet, pointed at creating it', () => {
    const html = render('see [[Deployment Runbook]]');
    expect(html).toContain('wiki-link-missing');
    expect(html).toContain('href="/projects/demo/wiki?new=Deployment%20Runbook"');
    expect(html).toContain('does not exist yet');
  });

  it('shows the label, not the target, when one is given', () => {
    expect(render('[[Deployment Runbook|the runbook]]', ['deployment-runbook'])).toContain('>the runbook</a>');
  });

  it('escapes a label so a link cannot smuggle markup', () => {
    const html = render('[[Page|<img src=x onerror=alert(1)>]]', ['page']);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes the target inside the generated href and title', () => {
    const html = render('[[a "quoted" page]]');
    expect(html).not.toMatch(/title="[^"]*"[^>]*"/);
    expect(html).toContain('&quot;');
  });

  it('leaves code untouched', () => {
    const body = '```\n[[Beta]]\n```';
    expect(render(body, ['beta'])).toBe(body);
  });

  it('leaves text alone when there are no links', () => {
    expect(render('plain text')).toBe('plain text');
  });
});

describe('backlinksFor', () => {
  const pages = [
    { slug: 'alpha', title: 'Alpha', body: 'links to [[Beta]]' },
    { slug: 'beta', title: 'Beta', body: 'nothing here' },
    { slug: 'gamma', title: 'Gamma', body: 'also [[beta|see beta]]' },
    { slug: 'delta', title: 'Delta', body: '```\n[[Beta]]\n```' }
  ];

  it('finds every page that links to the target', () => {
    expect(backlinksFor(pages, 'beta').map((page) => page.slug)).toEqual(['alpha', 'gamma']);
  });

  it('does not count a mention inside code as a backlink', () => {
    expect(backlinksFor(pages, 'beta').map((page) => page.slug)).not.toContain('delta');
  });

  it('never reports a page as its own backlink', () => {
    const self = [{ slug: 'alpha', title: 'Alpha', body: 'see [[Alpha]]' }];
    expect(backlinksFor(self, 'alpha')).toEqual([]);
  });
});

describe('missingPages', () => {
  it('lists what the wiki says should exist but does not, most-wanted first', () => {
    const pages = [
      { slug: 'a', title: 'A', body: '[[Runbook]] [[Glossary]]' },
      { slug: 'b', title: 'B', body: '[[Runbook]]' },
      { slug: 'runbook-done', title: 'Done', body: '' }
    ];
    const missing = missingPages(pages);
    expect(missing.map((entry) => entry.slug)).toEqual(['runbook', 'glossary']);
    expect(missing[0].from).toEqual(['a', 'b']);
  });

  it('never asks anyone to write a page for a card reference', () => {
    const pages = [{ slug: 'a', title: 'A', body: 'Blocked by [[#42]] and [[#9999|gone]].' }];
    expect(missingPages(pages)).toEqual([]);
  });

  it('says nothing is missing when every link resolves', () => {
    const pages = [
      { slug: 'a', title: 'A', body: '[[B]]' },
      { slug: 'b', title: 'B', body: '' }
    ];
    expect(missingPages(pages)).toEqual([]);
  });
});

describe('wikiExcerpt', () => {
  it('takes the first prose line and strips the markup around it', () => {
    expect(wikiExcerpt('# Title\n\nThe **first** real line.')).toBe('The first real line.');
  });

  it('reads a link by its label rather than showing the brackets', () => {
    expect(wikiExcerpt('Start at [[Deployment Runbook|the runbook]].')).toBe('Start at the runbook.');
  });

  it('skips a leading code block', () => {
    expect(wikiExcerpt('```\ncode\n```\n\nProse follows.')).toBe('Prose follows.');
  });

  it('truncates with an ellipsis and returns empty for an empty page', () => {
    expect(wikiExcerpt('x'.repeat(300))).toHaveLength(160);
    expect(wikiExcerpt('   \n\n  ')).toBe('');
  });
});

const renderWithCards = (body: string, cards: Record<number, { id: string; title: string; lane: string }>) =>
  renderWikiLinks(body, {
    basePath: '/projects/demo/wiki',
    cardBasePath: '/projects/demo',
    exists: () => false,
    card: (number) => cards[number] ?? null
  });

describe('parseCardRefs', () => {
  it('reads a board card reference written as [[#42]]', () => {
    expect(parseCardRefs('Blocked by [[#42]].')).toEqual([{ number: 42, label: '#42' }]);
  });

  it('keeps a label when one is given', () => {
    expect(parseCardRefs('[[#7|the import packet]]')).toEqual([{ number: 7, label: 'the import packet' }]);
  });

  it('de-duplicates repeated references to one card', () => {
    expect(parseCardRefs('[[#3]] and later [[#3|again]]')).toHaveLength(1);
  });

  it('is not confused by an ordinary page link', () => {
    expect(parseCardRefs('[[Runbook]] and [[#5]]').map((ref) => ref.number)).toEqual([5]);
  });

  it('ignores references inside code, like every other link', () => {
    expect(parseCardRefs('```\n[[#9]]\n```')).toEqual([]);
  });

  it('rejects a non-number and a zero', () => {
    expect(parseCardRefs('[[#abc]] [[#0]] [[#]]')).toEqual([]);
  });
});

describe('rendering card references', () => {
  const cards = { 42: { id: 'card-42', title: 'Build the importer', lane: 'In progress' } };

  it('links a known card to its drawer on the board', () => {
    const html = renderWithCards('See [[#42]].', cards);
    expect(html).toContain('href="/projects/demo?card=card-42"');
    expect(html).toContain('Build the importer');
    expect(html).toContain('wiki-card-number');
  });

  it('shows the card title rather than the raw number', () => {
    expect(renderWithCards('[[#42]]', cards)).toContain('>Build the importer</a>');
  });

  it('prefers an explicit label over the card title', () => {
    expect(renderWithCards('[[#42|that packet]]', cards)).toContain('>that packet</a>');
  });

  it('renders a reference to a card that does not exist as inert, not as a broken page link', () => {
    const html = renderWithCards('[[#99]]', cards);
    expect(html).toContain('wiki-card-link-missing');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('wiki?new=');
  });

  it('escapes the card title, which is user-supplied', () => {
    const html = renderWithCards('[[#1]]', { 1: { id: 'c1', title: '<img src=x onerror=alert(1)>', lane: 'Todo' } });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('falls back to a plain page link when no card resolver is supplied', () => {
    const html = renderWikiLinks('[[#42]]', { basePath: '/projects/demo/wiki', exists: () => false });
    expect(html).toContain('wiki-link-missing');
  });
});
