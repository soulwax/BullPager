/**
 * Wiki link grammar: `[[Target]]` and `[[Target|Label]]`.
 *
 * This is the piece that separates a wiki from a folder of notes. Three
 * behaviours matter and are all tested:
 *
 * 1. **A link to a page that does not exist yet is still a link.** Writing
 *    `[[Deployment runbook]]` before that page exists is how a wiki grows —
 *    the link renders as "missing" and clicking it opens the create form with
 *    the title filled in. Refusing to render it would make the wiki only
 *    documentable backwards.
 * 2. **Code is not prose.** `[[...]]` inside a fenced block or inline code is
 *    sample text, not a link. A wiki whose code samples silently turn into
 *    links is worse than one with no links at all.
 * 3. **Titles and slugs are separable.** Two people writing "Deployment
 *    Runbook" and "deployment runbook" mean the same page, so lookup is by
 *    normalised slug while the page keeps whatever title it was given.
 */

/** Matches `[[Target]]` / `[[Target|Label]]`; neither part may contain `]`. */
const LINK = /\[\[([^\]|]+?)(?:\|([^\]]*?))?\]\]/g;

/** `[[#42]]` addresses a board card, not a wiki page. */
const CARD_REF = /^#(\d{1,6})$/;

/** Fenced blocks (``` or ~~~) and inline code spans, in source order. */
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

export type WikiLink = {
  /** Text as written, before slugging. */
  target: string;
  /** What the reader sees; the target when no `|label` was given. */
  label: string;
  slug: string;
};

/**
 * Normalises a title to its lookup slug.
 *
 * Deliberately lossy and stable: case, punctuation, and runs of whitespace
 * all collapse, so `Deployment Runbook`, `deployment runbook`, and
 * `Deployment — Runbook!` are one page rather than three near-duplicates
 * nobody notices they created.
 */
export function wikiSlug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** True when a slug is usable as a page address. */
export function isValidWikiSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug);
}

/** Splits source into alternating prose and code segments, in order. */
function segments(source: string): { text: string; code: boolean }[] {
  const parts: { text: string; code: boolean }[] = [];
  let last = 0;
  for (const match of source.matchAll(CODE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: source.slice(last, start), code: false });
    parts.push({ text: match[0], code: true });
    last = start + match[0].length;
  }
  if (last < source.length) parts.push({ text: source.slice(last), code: false });
  return parts;
}

/** Every link in the body, in order, de-duplicated by slug. */
export function parseWikiLinks(body: string): WikiLink[] {
  const found = new Map<string, WikiLink>();
  for (const segment of segments(body)) {
    if (segment.code) continue;
    for (const match of segment.text.matchAll(LINK)) {
      const target = match[1].trim();
      if (!target) continue;
      // A card reference is a link out of the wiki, not a page in it. Without
      // this, `[[#42]]` slugs to "42" and shows up as a page that ought to be
      // written — on this page's link list *and* on the index's wanted-pages
      // list, which is how it was first noticed.
      if (CARD_REF.test(target)) continue;
      const slug = wikiSlug(target);
      if (!slug || found.has(slug)) continue;
      found.set(slug, { target, label: (match[2] ?? '').trim() || target, slug });
    }
  }
  return [...found.values()];
}

const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ESCAPE[character]);

/**
 * Rewrites `[[links]]` into anchors, ahead of the Markdown renderer.
 *
 * Emitting HTML here (rather than Markdown link syntax) is what lets a
 * missing page carry a class the stylesheet can show as a red link. Labels
 * are escaped on the way in, and the result still passes through the same
 * DOMPurify sanitiser as the rest of the body — no path skips it.
 */
export function renderWikiLinks(
  body: string,
  options: {
    basePath: string;
    exists: (slug: string) => boolean;
    /** Optional: resolves `[[#42]]` to a card on the same project's board. */
    card?: (number: number) => ResolvedCard | null;
    cardBasePath?: string;
  }
): string {
  return segments(body)
    .map((segment) => {
      if (segment.code) return segment.text;
      return segment.text.replace(LINK, (whole, rawTarget: string, rawLabel?: string) => {
        const target = rawTarget.trim();
        if (!target) return whole;

        // `[[#42]]` crosses to the board rather than naming a wiki page, so it
        // is resolved before the page lookup — otherwise "#42" would slug to
        // "42" and offer to create a page with that name.
        const cardRef = CARD_REF.exec(target);
        if (cardRef && options.card && options.cardBasePath) {
          const number = Number(cardRef[1]);
          const card = options.card(number);
          const shown = escapeHtml((rawLabel ?? '').trim() || (card ? card.title : target));
          if (!card) {
            return `<span class="wiki-card-link wiki-card-link-missing" title="No card #${number} on this board">${shown}</span>`;
          }
          return `<a class="wiki-card-link" href="${escapeHtml(`${options.cardBasePath}?card=${encodeURIComponent(card.id)}`)}" title="${escapeHtml(`${card.title} — ${card.lane}`)}"><span class="wiki-card-number">#${number}</span>${shown}</a>`;
        }

        const slug = wikiSlug(target);
        if (!slug) return whole;
        const label = escapeHtml((rawLabel ?? '').trim() || target);
        const known = options.exists(slug);
        const href = known
          ? `${options.basePath}/${slug}`
          : `${options.basePath}?new=${encodeURIComponent(target)}`;
        const className = known ? 'wiki-link' : 'wiki-link wiki-link-missing';
        const title = known ? '' : ` title="${escapeHtml(target)} — page does not exist yet"`;
        return `<a class="${className}" href="${escapeHtml(href)}"${title}>${label}</a>`;
      });
    })
    .join('');
}

/**
 * `[[#42]]` references a board card by its number.
 *
 * The number is the handle a person already sees on every card front and in
 * the card drawer's title, so it is the one identifier they can type from
 * memory. A card id would be stable too, but nobody knows it; a card *title*
 * changes and would rot the link.
 *
 * Deliberately the same `[[...]]` grammar as a page link: from the writer's
 * side "link to the thing" is one gesture, and the leading `#` is what says
 * which side of the project it lives on.
 */

export type CardRef = { number: number; label: string };

/** Card numbers referenced from a body, in order, de-duplicated. */
export function parseCardRefs(body: string): CardRef[] {
  const found = new Map<number, CardRef>();
  for (const segment of segments(body)) {
    if (segment.code) continue;
    for (const match of segment.text.matchAll(LINK)) {
      const target = match[1].trim();
      const ref = CARD_REF.exec(target);
      if (!ref) continue;
      const number = Number(ref[1]);
      if (!Number.isFinite(number) || number <= 0 || found.has(number)) continue;
      found.set(number, { number, label: (match[2] ?? '').trim() || target });
    }
  }
  return [...found.values()];
}

export type ResolvedCard = { id: string; title: string; lane: string };

export type WikiPageRef = { slug: string; title: string; body: string };

/** Pages whose body links to `slug`, most recently referenced order preserved. */
export function backlinksFor(pages: WikiPageRef[], slug: string): WikiPageRef[] {
  return pages.filter((page) => page.slug !== slug && parseWikiLinks(page.body).some((link) => link.slug === slug));
}

/**
 * Links that point at pages nobody has written yet, aggregated across the
 * whole wiki — the list of what the wiki says it should contain but does not.
 */
export function missingPages(pages: WikiPageRef[]): { slug: string; target: string; from: string[] }[] {
  const known = new Set(pages.map((page) => page.slug));
  const wanted = new Map<string, { slug: string; target: string; from: string[] }>();
  for (const page of pages) {
    for (const link of parseWikiLinks(page.body)) {
      if (known.has(link.slug)) continue;
      const entry = wanted.get(link.slug) ?? { slug: link.slug, target: link.target, from: [] };
      if (!entry.from.includes(page.slug)) entry.from.push(page.slug);
      wanted.set(link.slug, entry);
    }
  }
  return [...wanted.values()].sort((a, b) => b.from.length - a.from.length || a.slug.localeCompare(b.slug));
}

/** First non-empty prose line, for the index list. Never leaks raw markup. */
export function wikiExcerpt(body: string, limit = 160): string {
  for (const segment of segments(body)) {
    if (segment.code) continue;
    for (const line of segment.text.split(/\r?\n/)) {
      // A leading heading is almost always the page title repeated, and the
      // index already shows the title right beside this — so skip headings
      // and find the first line that actually says something new.
      if (/^\s*#{1,6}\s+/.test(line)) continue;
      const text = line
        .replace(LINK, (_whole, target: string, label?: string) => (label ?? '').trim() || target.trim())
        .replace(/[*_`>]/g, '')
        .trim();
      if (text) return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
    }
  }
  return '';
}
