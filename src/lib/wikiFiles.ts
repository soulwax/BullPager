import { wikiSlug } from '$lib/wikiLinks';

/**
 * The wiki is markdown files in the project's own cloud, not a private table.
 *
 * Every page is a real `.md` file under `wiki/` in that project's file store,
 * so the same content is browsable, downloadable, and editable from the Cloud
 * view — nothing about the wiki is hidden behind a schema only this feature
 * understands. Folders come free: `wiki/scaffolding/pages/etc.md` is a page at
 * `scaffolding/pages/etc`.
 *
 * Scoping is strictly per project, which the file store already guarantees:
 * `board_project_files` is unique on `(project_slug, path)`, and every query
 * here passes a slug. One project's `wiki/runbook.md` can never be another's.
 *
 * Metadata is optional on purpose. A file someone drops into the cloud by
 * hand, with no front matter and no heading, is still a valid page — its
 * title falls back to the filename. Being readable by a human with a text
 * editor is the point of storing it this way.
 */

export const WIKI_ROOT = 'wiki';
const MARKDOWN = /\.md$/i;

/** Matches the file store's own path rule, so a page id can always be stored. */
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;

export type WikiFileMeta = {
  title?: string;
  pinned?: boolean;
};

/** `scaffolding/pages/etc` → `wiki/scaffolding/pages/etc.md`. */
export function wikiPathFor(pageId: string): string {
  return `${WIKI_ROOT}/${pageId}.md`;
}

/** The inverse; `null` for any file that is not a wiki page. */
export function pageIdFromPath(path: string): string | null {
  if (!path.startsWith(`${WIKI_ROOT}/`) || !MARKDOWN.test(path)) return null;
  const id = path.slice(WIKI_ROOT.length + 1).replace(MARKDOWN, '');
  return id ? id : null;
}

/**
 * Normalises a title (or a hand-typed path) into a storable page id.
 *
 * Slashes survive so nesting can be typed directly — "Scaffolding/Pages" is a
 * page inside a folder — while each segment is slugged the same way a link
 * target is, so `[[Deployment Runbook]]` and a file named
 * `deployment-runbook.md` are the same page.
 */
export function pageIdFor(input: string): string {
  const segments = input
    .split('/')
    .map((segment) => wikiSlug(segment))
    .filter(Boolean);
  return segments.join('/');
}

export function isValidPageId(pageId: string): boolean {
  if (!pageId || pageId.length > 160) return false;
  const segments = pageId.split('/');
  return segments.length <= 6 && segments.every((segment) => SEGMENT.test(segment));
}

/** The last segment — what a `[[link]]` resolves against. */
export function pageKey(pageId: string): string {
  const segments = pageId.split('/');
  return segments[segments.length - 1];
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * A deliberately tiny front-matter reader: `title` and `pinned`, nothing else.
 *
 * This is not YAML and does not pretend to be. Supporting only the two keys
 * the wiki actually uses means a malformed block degrades to "no metadata"
 * rather than throwing on someone's hand-written file.
 */
export function parseWikiFile(content: string): { meta: WikiFileMeta; body: string } {
  const match = FRONT_MATTER.exec(content);
  if (!match) return { meta: {}, body: content };
  const meta: WikiFileMeta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    const value = pair[2].trim().replace(/^["']|["']$/g, '');
    if (key === 'title') meta.title = value;
    else if (key === 'pinned') meta.pinned = value === 'true';
  }
  // Drop the blank line that conventionally separates the block from the
  // body, so parse and serialize are inverses rather than accumulating a
  // leading newline on every save.
  return { meta, body: content.slice(match[0].length).replace(/^\r?\n/, '') };
}

/**
 * Writes a page back out.
 *
 * Front matter is emitted only when it carries something the body cannot say
 * on its own — a pinned flag, or a title that differs from the `# heading`.
 * A plain page stays a plain markdown file with no machine preamble.
 */
export function serializeWikiFile(input: { title: string; pinned?: boolean; body: string }): string {
  const body = input.body.replace(/^\s+/, '');
  const headingTitle = firstHeading(body);
  const needsTitle = !headingTitle || headingTitle !== input.title;
  const lines: string[] = [];
  if (needsTitle) lines.push(`title: ${input.title}`);
  if (input.pinned) lines.push('pinned: true');
  if (!lines.length) return body.endsWith('\n') ? body : `${body}\n`;
  const withNewline = body.endsWith('\n') ? body : `${body}\n`;
  return `---\n${lines.join('\n')}\n---\n\n${withNewline}`;
}

function firstHeading(body: string): string | null {
  const match = /^#\s+(.+)$/m.exec(body);
  return match ? match[1].trim() : null;
}

/** Front matter, then a `# heading`, then the filename. Never empty. */
export function titleFor(pageId: string, meta: WikiFileMeta, body: string): string {
  if (meta.title?.trim()) return meta.title.trim();
  const heading = firstHeading(body);
  if (heading) return heading;
  return pageKey(pageId)
    .split('-')
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ') || pageId;
}

/** The folder a page sits in, for grouping the index. `''` at the root. */
export function pageFolder(pageId: string): string {
  const cut = pageId.lastIndexOf('/');
  return cut === -1 ? '' : pageId.slice(0, cut);
}
