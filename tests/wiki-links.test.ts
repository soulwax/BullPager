import { describe, expect, it } from 'vitest';
import {
  backlinksFor,
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
