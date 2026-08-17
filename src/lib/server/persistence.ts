import { and, desc, eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { BoardProject, BoardUser, Packet, PacketNote, PacketState, ProjectActivity, ProjectCard, ProjectChecklistItem, ProjectTag, ProjectViewState, TransitionRecord, UserRole } from '$lib/types';
import { defaultProjectTags, slugifyTag, tagColors, tagId } from '$lib/projectTags';
import { databaseConfigured, db, neonClient } from './db';
import { boardProjectActivity, boardProjectCardTags, boardProjectCards, boardProjectTags, boardProjectViews, boardProjects, boardSettings, boardUsers, packetNotes, packetTransitions } from './db/schema';

export type PersistedTransition = {
  packetId: string;
  nextState: PacketState;
  owner: string;
  evidence: string;
  remainder: string;
  sourceHash: string;
};

const rawSql = neonClient;
let schemaReady: Promise<void> | undefined;

export function persistenceEnabled() { return databaseConfigured(); }

function requireDatabase() {
  if (!db || !rawSql) throw new Error('Persistence is not configured. Set DATABASE_URL in the Vercel project.');
  return db;
}

/** Bootstrap existing tables for deployments without a migration runner. Runtime reads/writes use Drizzle. */
async function initializeSchema() {
  requireDatabase();
  if (!rawSql) throw new Error('Persistence is not configured.');
  await Promise.all([rawSql`
    CREATE TABLE IF NOT EXISTS packet_transitions (
      id BIGSERIAL PRIMARY KEY,
      packet_id TEXT NOT NULL,
      next_state TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT '',
      evidence TEXT NOT NULL DEFAULT '',
      remainder TEXT NOT NULL DEFAULT '',
      source_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS packet_notes (
      id BIGSERIAL PRIMARY KEY,
      packet_id TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
      github_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_projects (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK (visibility IN ('private', 'shared')) DEFAULT 'private',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_cards (
      id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      lane TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      checklist TEXT NOT NULL DEFAULT '[]',
      owner TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal',
      due_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_tags (
      id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_slug, name)
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_card_tags (
      card_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (card_id, tag_id)
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_views (
      project_slug TEXT NOT NULL,
      username TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_slug, username)
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_activity (
      id BIGSERIAL PRIMARY KEY,
      project_slug TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      card_id TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `]);
  await rawSql`ALTER TABLE board_project_cards ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal', ADD COLUMN IF NOT EXISTS due_date DATE, ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS checklist TEXT NOT NULL DEFAULT '[]'`;
  await rawSql`ALTER TABLE board_users ADD COLUMN IF NOT EXISTS github_id TEXT UNIQUE`;
  await rawSql`
    INSERT INTO board_projects (slug, name, owner, visibility)
    VALUES ('unity-plan', 'Unity migration plan', ${env.APP_LOGIN || 'superadmin'}, 'private')
    ON CONFLICT (slug) DO NOTHING
  `;
}

async function ensureSchema() {
  requireDatabase();
  if (!schemaReady) {
    schemaReady = initializeSchema().catch((error) => {
      // A transient Neon/Vercel failure must not poison this process forever.
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}

export async function loadPersistedTransitions(): Promise<PersistedTransition[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const database = requireDatabase();
  const rows = await database.select().from(packetTransitions).orderBy(desc(packetTransitions.createdAt), desc(packetTransitions.id));
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!latest.has(row.packetId)) latest.set(row.packetId, row);
  return [...latest.values()].map((row) => ({ packetId: row.packetId, nextState: row.nextState, owner: row.owner, evidence: row.evidence, remainder: row.remainder, sourceHash: row.sourceHash }));
}

export async function loadTransitionHistory(limit = 20): Promise<TransitionRecord[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const rows = await requireDatabase().select().from(packetTransitions).orderBy(desc(packetTransitions.createdAt), desc(packetTransitions.id)).limit(limit);
  return rows.map((row) => ({ packetId: row.packetId, nextState: row.nextState, owner: row.owner, evidence: row.evidence, remainder: row.remainder, createdAt: row.createdAt }));
}

export async function saveTransition(transition: PersistedTransition) {
  await ensureSchema();
  await requireDatabase().insert(packetTransitions).values(transitionToRow(transition));
}

function transitionToRow(transition: PersistedTransition) {
  return { packetId: transition.packetId, nextState: transition.nextState, owner: transition.owner, evidence: transition.evidence, remainder: transition.remainder, sourceHash: transition.sourceHash };
}

export async function loadPacketNotes(): Promise<PacketNote[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const rows = await requireDatabase().select().from(packetNotes).orderBy(desc(packetNotes.createdAt), desc(packetNotes.id)).limit(200);
  return rows.map((row) => ({ id: String(row.id), packetId: row.packetId, author: row.author, body: row.body, createdAt: row.createdAt }));
}

export async function savePacketNote(packetId: string, author: string, body: string) {
  await ensureSchema();
  await requireDatabase().insert(packetNotes).values({ packetId, author, body });
}

function encodePassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password: string, encoded: string) {
  const [salt, expected] = encoded.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export async function authenticateUser(username: string, password: string): Promise<UserRole | null> {
  if (!databaseConfigured()) return null;
  await ensureSchema();
  const rows = await requireDatabase().select({ role: boardUsers.role, passwordHash: boardUsers.passwordHash }).from(boardUsers).where(eq(boardUsers.username, username)).limit(1);
  return rows[0] && verifyPassword(password, rows[0].passwordHash) ? rows[0].role : null;
}

export async function authenticateGithubUser(githubId: string, username: string, defaultRole: Exclude<UserRole, 'superadmin'> = 'viewer'): Promise<UserRole> {
  await ensureSchema();
  const database = requireDatabase();
  const existing = await database.select({ role: boardUsers.role }).from(boardUsers).where(eq(boardUsers.githubId, githubId)).limit(1);
  if (existing[0]) return existing[0].role;
  const byName = await database.select({ role: boardUsers.role }).from(boardUsers).where(eq(boardUsers.username, username)).limit(1);
  if (byName[0]) {
    await database.update(boardUsers).set({ githubId }).where(eq(boardUsers.username, username));
    return byName[0].role;
  }
  await database.insert(boardUsers).values({ username, passwordHash: `github:${randomBytes(24).toString('hex')}`, role: defaultRole, githubId });
  return defaultRole;
}

export async function listBoardUsers(): Promise<BoardUser[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardUsers).orderBy(boardUsers.username);
  return rows.map((row) => ({ username: row.username, role: row.role as UserRole, createdAt: row.createdAt }));
}

export async function listBoardProjects(): Promise<BoardProject[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardProjects).orderBy(boardProjects.name);
  return rows.map((row) => ({ slug: row.slug, name: row.name, owner: row.owner, visibility: row.visibility }));
}

export async function getBoardProject(slug: string): Promise<BoardProject | null> {
  if (!databaseConfigured()) return null;
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardProjects).where(eq(boardProjects.slug, slug)).limit(1);
  const row = rows[0];
  return row ? { slug: row.slug, name: row.name, owner: row.owner, visibility: row.visibility } : null;
}

export async function createBoardProject(project: BoardProject) {
  await ensureSchema();
  await requireDatabase().insert(boardProjects).values(project);
  await ensureDefaultProjectTags(project.slug);
}

export async function loadBoardSettings(): Promise<Record<string, string>> {
  if (!databaseConfigured()) return {};
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardSettings);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function saveBoardSettings(settings: Record<string, string>) {
  await ensureSchema();
  const database = requireDatabase();
  await Promise.all(Object.entries(settings).map(([key, value]) => database.insert(boardSettings).values({ key, value }).onConflictDoUpdate({ target: boardSettings.key, set: { value, updatedAt: new Date().toISOString() } })));
}

async function ensureDefaultProjectTags(projectSlug: string) {
  const database = requireDatabase();
  await database.insert(boardProjectTags).values(defaultProjectTags.map((tag) => ({ id: tagId(projectSlug, tag.slug), projectSlug, name: tag.name, color: tag.color }))).onConflictDoNothing();
}

export async function listProjectTags(projectSlug: string): Promise<ProjectTag[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  await ensureDefaultProjectTags(projectSlug);
  const rows = await requireDatabase().select().from(boardProjectTags).where(eq(boardProjectTags.projectSlug, projectSlug)).orderBy(boardProjectTags.name);
  return rows.map((row) => ({ id: row.id, projectSlug: row.projectSlug, name: row.name, color: row.color, createdAt: row.createdAt }));
}

export async function createProjectTag(projectSlug: string, name: string, color: string): Promise<ProjectTag> {
  await ensureSchema();
  const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 32);
  const slug = slugifyTag(cleanName);
  if (slug.length < 1 || cleanName.length < 1 || !tagColors.has(color)) throw new Error('Choose a tag name and a supported palette color.');
  const id = tagId(projectSlug, slug);
  const existing = await requireDatabase().select({ id: boardProjectTags.id }).from(boardProjectTags).where(eq(boardProjectTags.id, id)).limit(1);
  if (existing[0]) throw new Error('TAG_EXISTS');
  await requireDatabase().insert(boardProjectTags).values({ id, projectSlug, name: cleanName, color });
  const row = (await requireDatabase().select().from(boardProjectTags).where(eq(boardProjectTags.id, id)).limit(1))[0];
  if (!row) throw new Error('The tag could not be loaded after creation.');
  return { id: row.id, projectSlug: row.projectSlug, name: row.name, color: row.color, createdAt: row.createdAt };
}

export async function deleteProjectTag(projectSlug: string, id: string) {
  await ensureSchema();
  await requireDatabase().delete(boardProjectCardTags).where(eq(boardProjectCardTags.tagId, id));
  await requireDatabase().delete(boardProjectTags).where(and(eq(boardProjectTags.id, id), eq(boardProjectTags.projectSlug, projectSlug)));
}

async function replaceCardTags(projectSlug: string, cardId: string, tagIds: string[]) {
  const uniqueIds = [...new Set(tagIds.filter(Boolean))].slice(0, 12);
  const database = requireDatabase();
  if (uniqueIds.length) {
    const valid = await database.select({ id: boardProjectTags.id }).from(boardProjectTags).where(and(eq(boardProjectTags.projectSlug, projectSlug), inArray(boardProjectTags.id, uniqueIds)));
    if (valid.length !== uniqueIds.length) throw new Error('One or more selected tags do not belong to this project.');
  }
  await database.delete(boardProjectCardTags).where(eq(boardProjectCardTags.cardId, cardId));
  if (uniqueIds.length) await database.insert(boardProjectCardTags).values(uniqueIds.map((tagId) => ({ cardId, tagId })));
}

function parseChecklist(value: string | null | undefined): ProjectChecklistItem[] {
  try {
    const parsed = JSON.parse(value ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { id: unknown; text: unknown; done?: unknown } => Boolean(item && typeof item === 'object'))
      .map((item) => ({ id: String(item.id ?? '').trim().slice(0, 80), text: String(item.text ?? '').trim().slice(0, 240), done: item.done === true }))
      .filter((item) => item.id.length > 0 && item.text.length > 0)
      .slice(0, 30);
  } catch {
    return [];
  }
}

export async function listProjectCards(projectSlug: string): Promise<ProjectCard[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const database = requireDatabase();
  const rows = await database.select().from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug)).orderBy(boardProjectCards.lane, boardProjectCards.position, boardProjectCards.createdAt, boardProjectCards.id);
  const tags = await listProjectTags(projectSlug);
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const cardTags = rows.length ? await database.select({ cardId: boardProjectCardTags.cardId, tagId: boardProjectCardTags.tagId }).from(boardProjectCardTags).where(inArray(boardProjectCardTags.cardId, rows.map((row) => row.id))) : [];
  const tagsByCard = new Map<string, ProjectTag[]>();
  for (const entry of cardTags) {
    const tag = tagById.get(entry.tagId);
    if (tag) tagsByCard.set(entry.cardId, [...(tagsByCard.get(entry.cardId) ?? []), tag]);
  }
  return rows.map((row) => ({ id: row.id, projectSlug: row.projectSlug, title: row.title, details: row.details, lane: row.lane, position: row.position, archived: row.archived, checklist: parseChecklist(row.checklist), owner: row.owner, priority: row.priority, dueDate: row.dueDate, tags: tagsByCard.get(row.id) ?? [], createdAt: row.createdAt, updatedAt: row.updatedAt }));
}

type ProjectCardWrite = Pick<ProjectCard, 'id' | 'projectSlug' | 'title' | 'details' | 'lane' | 'owner' | 'priority' | 'dueDate' | 'archived' | 'checklist'> & { tagIds?: string[] };

export async function createProjectCard(card: ProjectCardWrite) {
  await ensureSchema();
  const { tagIds = [], checklist = [], ...values } = card;
  const database = requireDatabase();
  const laneCards = await database.select({ position: boardProjectCards.position }).from(boardProjectCards).where(and(eq(boardProjectCards.projectSlug, card.projectSlug), eq(boardProjectCards.lane, card.lane)));
  const position = laneCards.reduce((max, item) => Math.max(max, item.position), -1) + 1;
  await database.insert(boardProjectCards).values({ ...values, checklist: JSON.stringify(checklist), position });
  await replaceCardTags(card.projectSlug, card.id, tagIds);
}

export async function updateProjectCard(card: ProjectCardWrite) {
  await ensureSchema();
  const { tagIds = [], checklist = [], ...values } = card;
  await requireDatabase().update(boardProjectCards).set({ title: values.title, details: values.details, lane: values.lane, owner: values.owner, priority: values.priority, dueDate: values.dueDate, archived: values.archived, checklist: JSON.stringify(checklist), updatedAt: new Date().toISOString() }).where(and(eq(boardProjectCards.id, values.id), eq(boardProjectCards.projectSlug, values.projectSlug)));
  await replaceCardTags(card.projectSlug, card.id, tagIds);
}

export async function reorderProjectCard(projectSlug: string, cardId: string, lane: string, beforeId = '') {
  await ensureSchema();
  const database = requireDatabase();
  const rows = await database.select().from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug)).orderBy(boardProjectCards.lane, boardProjectCards.position, boardProjectCards.createdAt, boardProjectCards.id);
  const moving = rows.find((row) => row.id === cardId);
  if (!moving) throw new Error('Card not found.');
  const destination = rows.filter((row) => row.lane === lane && row.id !== cardId);
  if (beforeId && !destination.some((row) => row.id === beforeId)) throw new Error('Destination card not found.');
  const insertAt = beforeId ? destination.findIndex((row) => row.id === beforeId) : destination.length;
  destination.splice(insertAt < 0 ? destination.length : insertAt, 0, { ...moving, lane });
  const updates = new Map<string, { lane: string; position: number }>();
  for (const [index, row] of destination.entries()) updates.set(row.id, { lane, position: index });
  let otherPosition = 0;
  for (const row of rows) {
    if (row.lane === lane || row.id === cardId) continue;
    updates.set(row.id, { lane: row.lane, position: otherPosition++ });
  }
  await Promise.all([...updates.entries()].map(([id, update]) => database.update(boardProjectCards).set({ lane: update.lane, position: update.position, updatedAt: new Date().toISOString() }).where(and(eq(boardProjectCards.id, id), eq(boardProjectCards.projectSlug, projectSlug)))));
}

export async function deleteProjectCard(projectSlug: string, id: string) {
  await ensureSchema();
  const database = requireDatabase();
  await database.delete(boardProjectCardTags).where(eq(boardProjectCardTags.cardId, id));
  await database.delete(boardProjectCards).where(and(eq(boardProjectCards.id, id), eq(boardProjectCards.projectSlug, projectSlug)));
}

export async function loadProjectViewState(projectSlug: string, username: string): Promise<ProjectViewState> {
  if (!databaseConfigured()) return {};
  await ensureSchema();
  const rows = await requireDatabase().select({ state: boardProjectViews.state }).from(boardProjectViews).where(and(eq(boardProjectViews.projectSlug, projectSlug), eq(boardProjectViews.username, username))).limit(1);
  if (!rows[0]) return {};
  try { return JSON.parse(rows[0].state) as ProjectViewState; } catch { return {}; }
}

export async function saveProjectViewState(projectSlug: string, username: string, state: ProjectViewState) {
  await ensureSchema();
  await requireDatabase().insert(boardProjectViews).values({ projectSlug, username, state: JSON.stringify(state) }).onConflictDoUpdate({ target: [boardProjectViews.projectSlug, boardProjectViews.username], set: { state: JSON.stringify(state), updatedAt: new Date().toISOString() } });
}

export async function recordProjectActivity(activity: Pick<ProjectActivity, 'projectSlug' | 'actor' | 'action' | 'cardId' | 'summary'>) {
  await ensureSchema();
  await requireDatabase().insert(boardProjectActivity).values(activity);
}

export async function listProjectActivity(projectSlug: string, limit = 30): Promise<ProjectActivity[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardProjectActivity).where(eq(boardProjectActivity.projectSlug, projectSlug)).orderBy(desc(boardProjectActivity.createdAt), desc(boardProjectActivity.id)).limit(limit);
  return rows.map((row) => ({ id: String(row.id), projectSlug: row.projectSlug, actor: row.actor, action: row.action, cardId: row.cardId, summary: row.summary, createdAt: row.createdAt }));
}

export async function createBoardUser(username: string, password: string, role: Exclude<UserRole, 'superadmin'>) {
  await ensureSchema();
  await requireDatabase().insert(boardUsers).values({ username, passwordHash: encodePassword(password), role });
}

export async function updateBoardUserRole(username: string, role: Exclude<UserRole, 'superadmin'>) {
  await ensureSchema();
  await requireDatabase().update(boardUsers).set({ role }).where(eq(boardUsers.username, username));
}

export async function deleteBoardUser(username: string) {
  await ensureSchema();
  await requireDatabase().delete(boardUsers).where(eq(boardUsers.username, username));
}

export function overlayTransitions(packets: Packet[], transitions: PersistedTransition[]): Packet[] {
  const byId = new Map(transitions.map((transition) => [transition.packetId, transition]));
  return packets.map((packet) => {
    const transition = byId.get(packet.id);
    if (!transition) return packet;
    return { ...packet, state: transition.nextState, owner: transition.owner || packet.owner, evidence: transition.evidence || packet.evidence, remainder: transition.remainder || packet.remainder };
  });
}
