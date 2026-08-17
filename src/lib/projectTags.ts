export const tagPalette = [
  { name: 'Sky', color: '#5E9CFF' },
  { name: 'Violet', color: '#9B8AFB' },
  { name: 'Rose', color: '#F08FC0' },
  { name: 'Amber', color: '#F4B860' },
  { name: 'Coral', color: '#F17878' },
  { name: 'Mint', color: '#68D6A4' },
  { name: 'Teal', color: '#55C2C9' },
  { name: 'Slate', color: '#A7B1C2' }
] as const;

export const defaultProjectTags = [
  { slug: 'frontend', name: 'Frontend', color: '#5E9CFF' },
  { slug: 'backend', name: 'Backend', color: '#9B8AFB' },
  { slug: 'design', name: 'Design', color: '#F08FC0' },
  { slug: 'research', name: 'Research', color: '#F4B860' },
  { slug: 'bug', name: 'Bug', color: '#F17878' },
  { slug: 'priority', name: 'Priority', color: '#68D6A4' },
  { slug: 'content', name: 'Content', color: '#55C2C9' },
  { slug: 'blocked', name: 'Blocked', color: '#A7B1C2' }
] as const;

export const tagColors = new Set<string>(tagPalette.map((item) => item.color));

export function tagId(projectSlug: string, slug: string) {
  return `${projectSlug}-tag-${slug}`;
}

export function slugifyTag(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}
