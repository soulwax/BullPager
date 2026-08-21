import { describe, expect, it } from 'vitest';
import { snippetAround } from '../src/lib/searchSnippet';

describe('snippetAround', () => {
  it('centres the window on the match', () => {
    const body = `${'left '.repeat(40)}NEEDLE ${'right '.repeat(40)}`;
    const snippet = snippetAround(body, 'needle');
    expect(snippet).toContain('NEEDLE');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('falls back to the opening when only the title matched', () => {
    expect(snippetAround('A body with no match at all.', 'zzz')).toBe('A body with no match at all.');
  });

  it('returns short text whole, with no ellipsis', () => {
    expect(snippetAround('Short body.', 'body')).toBe('Short body.');
  });

  it('strips markdown so the snippet reads as a sentence', () => {
    expect(snippetAround('# Heading\n\nSome **bold** and `code` text.', 'bold')).toBe('Heading Some bold and text.');
  });

  it('reads a wiki link by its label rather than its brackets', () => {
    expect(snippetAround('See [[Deployment Runbook|the runbook]] now.', 'runbook')).toBe('See the runbook now.');
  });

  it('drops fenced code, which is rarely the useful context', () => {
    expect(snippetAround('Before.\n\n```\nnoise\n```\n\nAfter.', 'after')).toBe('Before. After.');
  });

  it('drops front matter so metadata never leads a snippet', () => {
    expect(snippetAround('---\ntitle: X\n---\nReal body here.', 'body')).toBe('Real body here.');
  });

  it('never exceeds the requested width by much', () => {
    const snippet = snippetAround('word '.repeat(200), 'word', 60);
    expect(snippet.length).toBeLessThanOrEqual(64);
  });

  it('handles an empty body and an empty query without throwing', () => {
    expect(snippetAround('', 'x')).toBe('');
    expect(snippetAround('text', '')).toBe('text');
  });
});
