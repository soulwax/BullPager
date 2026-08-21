/**
 * A one-line excerpt around the match, for search results.
 *
 * A result list that shows only titles makes you open things to find out why
 * they matched. Showing the matched phrase in its own sentence is usually
 * enough to skip the round trip — which is the whole point of a search box in
 * the top bar rather than a page you navigate to.
 *
 * Deliberately plain text: the snippet is rendered as text, never as HTML, so
 * a page body containing markup cannot become markup in the dropdown.
 */

/** Collapses markdown noise and whitespace so a snippet reads as a sentence. */
function flatten(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^---[\s\S]*?---/, ' ')
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]*?))?\]\]/g, (_whole, target: string, label?: string) => (label ?? '').trim() || target.trim())
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns up to `width` characters centred on the first match.
 *
 * Falls back to the opening of the text when the query does not appear in the
 * body — which happens whenever the *title* is what matched, and is still the
 * most useful thing to show.
 */
export function snippetAround(source: string, query: string, width = 140): string {
  const text = flatten(source);
  if (!text) return '';
  const needle = query.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at === -1) return text.length > width ? `${text.slice(0, width - 1)}…` : text;

  // Centre the window on the match, then pull back to word boundaries so the
  // snippet does not start or end mid-word.
  const half = Math.floor((width - needle.length) / 2);
  let start = Math.max(0, at - half);
  let end = Math.min(text.length, start + width);
  start = Math.max(0, end - width);
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < at) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > at + needle.length) end = space;
  }
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
