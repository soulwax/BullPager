import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { BoardProject, BoardUser, GraphEdge, GraphEdgeKind, GraphNode, GraphNodeKind, GraphSettings, Packet, PacketNote, PacketState, ProjectActivity, ProjectCard, ProjectChecklistItem, ProjectComment, ProjectFile, ProjectFolder, ProjectTag, ProjectViewState, TransitionRecord, UserRole } from '$lib/types';
import { defaultProjectTags, slugifyTag, tagColors, tagId, tagPalette } from '$lib/projectTags';
import { databaseConfigured, db, neonClient } from './db';
import { boardProjectActivity, boardProjectCardTags, boardProjectCards, boardProjectCardWatchers, boardProjectComments, boardProjectFiles, boardProjectFolders, boardProjectGraphEdges, boardProjectGraphNodes, boardProjectGraphs, boardProjectTags, boardProjectViews, boardProjects, boardSettings, boardUsers, packetNotes, packetTransitions } from './db/schema';

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
      cover_color TEXT NOT NULL DEFAULT '',
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
    CREATE TABLE IF NOT EXISTS board_project_card_watchers (
      card_id TEXT NOT NULL,
      username TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (card_id, username)
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
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_comments (
      id BIGSERIAL PRIMARY KEY,
      project_slug TEXT NOT NULL,
      card_id TEXT NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_files (
      id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT 'text/markdown',
      size INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_slug, path)
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_folders (
      id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL,
      path TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_slug, path)
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_graphs (
      project_slug TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 1,
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_graph_nodes (
      id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('note', 'card', 'group')),
      card_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      x INTEGER NOT NULL DEFAULT 80,
      y INTEGER NOT NULL DEFAULT 80,
      width INTEGER NOT NULL DEFAULT 220,
      height INTEGER NOT NULL DEFAULT 130,
      color TEXT NOT NULL DEFAULT '#5E9CFF',
      collapsed BOOLEAN NOT NULL DEFAULT FALSE,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_graph_edges (
      id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL,
      source_node_id TEXT NOT NULL,
      target_node_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('relates_to', 'depends_on', 'leads_to', 'blocks')),
      label TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `]);
  await rawSql`ALTER TABLE board_project_cards ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal', ADD COLUMN IF NOT EXISTS due_date DATE, ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS checklist TEXT NOT NULL DEFAULT '[]', ADD COLUMN IF NOT EXISTS cover_color TEXT NOT NULL DEFAULT ''`;
  await rawSql`ALTER TABLE board_users ADD COLUMN IF NOT EXISTS github_id TEXT UNIQUE`;
  await rawSql`
    INSERT INTO board_projects (slug, name, owner, visibility)
    VALUES ('unity-plan', 'Unity implementation board', ${env.APP_LOGIN || 'superadmin'}, 'private')
    ON CONFLICT (slug) DO NOTHING
  `;
  await rawSql`
    UPDATE board_projects
    SET name = 'Unity implementation board'
    WHERE slug = 'unity-plan' AND name IN ('Unity migration plan', 'Unity greenfield build plan')
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

function plannerTagId(projectSlug: string, tag: string) {
  return tagId(projectSlug, `plan-${slugifyTag(tag)}`);
}

async function ensurePlannerTags(projectSlug: string, packets: Packet[]) {
  const names = [...new Set(packets.flatMap((packet) => packet.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
  if (!names.length) return;
  const values = names.map((name, index) => ({
    id: plannerTagId(projectSlug, name),
    projectSlug,
    name: name.slice(0, 32),
    color: tagPalette[index % tagPalette.length].color
  }));
  await requireDatabase().insert(boardProjectTags).values(values).onConflictDoNothing();
}

/**
 * Keep the Unity planner and its Kanban project in step. Packet IDs are stable
 * card IDs, so this operation is safe to run on every planner load. Planner
 * fields (title, details, checklist, owner, priority, and cover) are refreshed;
 * board-owned fields (lane, position, archive state, comments, watchers, and
 * view state) are deliberately left untouched for existing cards.
 */
export async function syncUnityPlannerCards(packets: Packet[], options: { sourceDigest?: string; actor?: string } = {}): Promise<number> {
  if (!databaseConfigured()) return 0;
  await ensureSchema();
  const database = requireDatabase();
  const projectSlug = 'unity-plan';
  const owner = env.APP_LOGIN || 'superadmin';
  await database.insert(boardProjects).values({ slug: projectSlug, name: 'Unity implementation board', owner, visibility: 'private' }).onConflictDoNothing();
  await database.update(boardProjects).set({ name: 'Unity implementation board' }).where(and(eq(boardProjects.slug, projectSlug), inArray(boardProjects.name, ['Unity migration plan', 'Unity greenfield build plan'])));
  await database.insert(boardSettings).values({ key: `project_${projectSlug}_lanes`, value: JSON.stringify(['Backlog', 'In progress', 'Blocked', 'Done']) }).onConflictDoNothing();
  await database.insert(boardSettings).values({ key: `project_${projectSlug}_theme`, value: 'midnight' }).onConflictDoNothing();
  await ensureDefaultProjectTags(projectSlug);
  await ensurePlannerTags(projectSlug, packets);
  const digestKey = `project_${projectSlug}_planner_digest`;
  const previousDigestRow = await database.select({ value: boardSettings.value }).from(boardSettings).where(eq(boardSettings.key, digestKey)).limit(1);
  const previousDigest = previousDigestRow[0]?.value || '';
  const rows = await database.select().from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug));
  const existing = new Map(rows.map((row) => [row.id, row]));
  const positions = new Map<string, number>();
  const current = await database.select({ lane: boardProjectCards.lane, position: boardProjectCards.position }).from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug));
  for (const row of current) positions.set(row.lane, Math.max(positions.get(row.lane) ?? -1, row.position));
  const stateLane = (state: PacketState) => state === 'BLOCKED' ? 'Blocked' : state === 'ACTIVE' || state === 'PARTIAL' ? 'In progress' : state === 'CLOSED' || state === 'DROPPED' ? 'Done' : 'Backlog';
  const stateColor = (state: PacketState) => state === 'BLOCKED' ? '#F17878' : state === 'ACTIVE' || state === 'PARTIAL' ? '#5E9CFF' : state === 'CLOSED' ? '#68D6A4' : '#A7B1C2';
  const priority = (state: PacketState): ProjectCard['priority'] => state === 'BLOCKED' ? 'urgent' : state === 'ACTIVE' || state === 'PARTIAL' ? 'high' : state === 'CLOSED' || state === 'DROPPED' ? 'low' : 'normal';
  const checklist = (steps: string, packetId: string): ProjectChecklistItem[] => steps
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)
    .map((text, index) => ({ id: `${packetId.toLowerCase()}-step-${index + 1}`, text: text.slice(0, 240), done: false }));
  const details = (packet: Packet) => [
    `Unity implementation packet ${packet.id}`,
    `Category: ${packet.category || 'Uncategorized'} · Subcategory: ${packet.subcategory || 'General'}`,
    packet.tags?.length ? `Tags: ${packet.tags.join(', ')}` : '',
    packet.handles?.length ? `Implementation handles: ${packet.handles.join(' → ')}` : '',
    `Milestone: ${packet.milestone} · State: ${packet.state} · Owner: ${packet.owner || 'unassigned'}`,
    packet.outcome ? `Outcome: ${packet.outcome}` : '',
    packet.inputs ? `Inputs: ${packet.inputs}` : '',
    packet.files ? `Files: ${packet.files}` : '',
    packet.checks ? `Checks: ${packet.checks}` : '',
    packet.evidence ? `Evidence: ${packet.evidence}` : '',
    packet.remainder ? `Remainder: ${packet.remainder}` : '',
    packet.dependsOn.length ? `Depends on: ${packet.dependsOn.join(', ')}` : ''
  ].filter(Boolean).join('\n\n').slice(0, 4000);
  const tagIds = (packet: Packet) => {
    const tags = [tagId(projectSlug, 'content'), ...(packet.tags ?? []).map((tag) => plannerTagId(projectSlug, tag))];
    if (packet.state === 'BLOCKED') tags.push(tagId(projectSlug, 'blocked'));
    if (packet.state === 'ACTIVE' || packet.state === 'PARTIAL') tags.push(tagId(projectSlug, 'priority'));
    return tags;
  };
  const managedTagIds = new Set([
    tagId(projectSlug, 'content'),
    tagId(projectSlug, 'blocked'),
    tagId(projectSlug, 'priority')
  ]);
  let changed = 0;
  const changedPacketIds: string[] = [];
  for (const packet of packets) {
    const lane = stateLane(packet.state);
    const id = `unity-${packet.id.toLowerCase()}`;
    const current = existing.get(id);
    const sourceValues = {
      title: `${packet.id} · ${packet.title}`,
      details: details(packet),
      checklist: JSON.stringify(checklist(packet.steps, packet.id)),
      coverColor: stateColor(packet.state),
      owner: packet.owner || 'unassigned',
      priority: priority(packet.state)
    };
    const desiredTags = tagIds(packet);
    if (current) {
      const cardTagRows = await database.select({ tagId: boardProjectCardTags.tagId }).from(boardProjectCardTags).where(eq(boardProjectCardTags.cardId, id));
      const customTags = cardTagRows.map((row) => row.tagId).filter((tag) => !managedTagIds.has(tag) && !tag.startsWith(`${projectSlug}-tag-plan-`));
      const nextTags = [...new Set([...customTags, ...desiredTags])].sort();
      const currentTags = [...new Set(cardTagRows.map((row) => row.tagId))].sort();
      const sourceChanged = current.title !== sourceValues.title || current.details !== sourceValues.details || current.checklist !== sourceValues.checklist || current.coverColor !== sourceValues.coverColor || current.owner !== sourceValues.owner || current.priority !== sourceValues.priority;
      const tagsChanged = currentTags.length !== nextTags.length || currentTags.some((tag, index) => tag !== nextTags[index]);
      if (sourceChanged) {
        await database.update(boardProjectCards).set({ ...sourceValues, updatedAt: new Date().toISOString() }).where(and(eq(boardProjectCards.id, id), eq(boardProjectCards.projectSlug, projectSlug)));
      }
      if (tagsChanged) await replaceCardTags(projectSlug, id, nextTags, database);
      if (sourceChanged || tagsChanged) {
        changed += 1;
        changedPacketIds.push(packet.id);
      }
      continue;
    }
    const position = (positions.get(lane) ?? -1) + 1;
    positions.set(lane, position);
    // Neon's HTTP driver does not expose interactive transactions. Each
    // insert is idempotent and the next request resumes any partial sync.
    await database.insert(boardProjectCards).values({
      id,
      projectSlug,
      ...sourceValues,
      lane,
      position,
      archived: false,
      dueDate: null
    }).onConflictDoNothing();
    await replaceCardTags(projectSlug, id, desiredTags, database);
    changed += 1;
    changedPacketIds.push(packet.id);
  }
  if (changed > 0 || (options.sourceDigest && options.sourceDigest !== previousDigest)) {
    await saveBoardSettings({
      [digestKey]: options.sourceDigest || '',
      [`project_${projectSlug}_last_sync_at`]: new Date().toISOString(),
      [`project_${projectSlug}_last_sync_count`]: String(changed),
      [`project_${projectSlug}_last_sync_packets`]: changedPacketIds.join(', ')
    });
  }
  if (changed > 0) {
    await recordProjectActivity({
      projectSlug,
      actor: options.actor || owner || 'system',
      action: 'updated',
      cardId: '',
      summary: `Unity plan sync: ${changed} card${changed === 1 ? '' : 's'} changed${options.sourceDigest ? ` · ${options.sourceDigest.slice(0, 12)}` : ''}${changedPacketIds.length ? ` · ${changedPacketIds.slice(0, 8).join(', ')}${changedPacketIds.length > 8 ? ', …' : ''}` : ''}`
    });
  }
  return changed;
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

const projectFilePathPattern = /^(?!\.)(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function normalizeProjectPath(value: string): string {
  const path = value.trim().replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (path.length < 1 || path.length > 180 || path.includes('..') || !projectFilePathPattern.test(path)) throw new Error('Use a relative folder path without traversal or special characters.');
  return path;
}

export function normalizeProjectFilePath(value: string): string {
  const path = value.trim().replaceAll('\\', '/').replace(/^\/+/, '');
  if (path.length < 1 || path.length > 180 || path.includes('..') || !projectFilePathPattern.test(path)) throw new Error('Use a relative text-file path without traversal or special characters.');
  return path;
}

function fileFromRow(row: typeof boardProjectFiles.$inferSelect): ProjectFile {
  return { id: row.id, projectSlug: row.projectSlug, path: row.path, content: row.content, mimeType: row.mimeType, size: row.size, createdBy: row.createdBy, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function listProjectFiles(projectSlug: string): Promise<ProjectFile[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardProjectFiles).where(eq(boardProjectFiles.projectSlug, projectSlug)).orderBy(boardProjectFiles.path);
  return rows.map(fileFromRow);
}

function folderFromRow(row: typeof boardProjectFolders.$inferSelect): ProjectFolder {
  return { id: row.id, projectSlug: row.projectSlug, path: row.path, createdBy: row.createdBy, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function listProjectFolders(projectSlug: string): Promise<ProjectFolder[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardProjectFolders).where(eq(boardProjectFolders.projectSlug, projectSlug)).orderBy(boardProjectFolders.path);
  return rows.map(folderFromRow);
}

export async function createProjectFolder(projectSlug: string, path: string, createdBy: string): Promise<ProjectFolder> {
  await ensureSchema();
  const normalizedPath = normalizeProjectPath(path);
  const existing = await requireDatabase().select({ id: boardProjectFolders.id }).from(boardProjectFolders).where(and(eq(boardProjectFolders.projectSlug, projectSlug), eq(boardProjectFolders.path, normalizedPath))).limit(1);
  if (existing[0]) throw new Error('FOLDER_EXISTS');
  const id = `folder-${Date.now()}-${randomBytes(6).toString('hex')}`;
  try {
    await requireDatabase().insert(boardProjectFolders).values({ id, projectSlug, path: normalizedPath, createdBy: createdBy.slice(0, 120) });
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) throw new Error('FOLDER_EXISTS');
    throw error;
  }
  const row = (await requireDatabase().select().from(boardProjectFolders).where(and(eq(boardProjectFolders.projectSlug, projectSlug), eq(boardProjectFolders.path, normalizedPath))).limit(1))[0];
  if (!row) throw new Error('The folder could not be loaded after creation.');
  return folderFromRow(row);
}

export async function getProjectFile(projectSlug: string, id: string): Promise<ProjectFile | null> {
  if (!databaseConfigured()) return null;
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardProjectFiles).where(and(eq(boardProjectFiles.projectSlug, projectSlug), eq(boardProjectFiles.id, id))).limit(1);
  return rows[0] ? fileFromRow(rows[0]) : null;
}

export async function getProjectFileByPath(projectSlug: string, path: string): Promise<ProjectFile | null> {
  if (!databaseConfigured()) return null;
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardProjectFiles).where(and(eq(boardProjectFiles.projectSlug, projectSlug), eq(boardProjectFiles.path, normalizeProjectFilePath(path)))).limit(1);
  return rows[0] ? fileFromRow(rows[0]) : null;
}

export async function upsertProjectFile(file: Pick<ProjectFile, 'id' | 'projectSlug' | 'path' | 'content' | 'mimeType' | 'createdBy'> & { size?: number }): Promise<ProjectFile> {
  await ensureSchema();
  const path = normalizeProjectFilePath(file.path);
  const content = file.content.slice(0, 1_000_000);
  const size = file.size ?? Buffer.byteLength(content, 'utf8');
  if (file.mimeType.startsWith('text/') && size > 1_000_000) throw new Error('Text files must be 1 MB or smaller.');
  const database = requireDatabase();
  await database.insert(boardProjectFiles).values({ id: file.id, projectSlug: file.projectSlug, path, content, mimeType: file.mimeType.slice(0, 120), size, createdBy: file.createdBy.slice(0, 120) }).onConflictDoUpdate({ target: [boardProjectFiles.projectSlug, boardProjectFiles.path], set: { content, mimeType: file.mimeType.slice(0, 120), size, updatedAt: new Date().toISOString() } });
  const rows = await database.select().from(boardProjectFiles).where(and(eq(boardProjectFiles.projectSlug, file.projectSlug), eq(boardProjectFiles.path, path))).limit(1);
  if (!rows[0]) throw new Error('The file could not be loaded after saving.');
  return fileFromRow(rows[0]);
}

export async function moveProjectFile(projectSlug: string, id: string, path: string): Promise<ProjectFile> {
  await ensureSchema();
  const normalizedPath = normalizeProjectFilePath(path);
  const database = requireDatabase();
  const current = await getProjectFile(projectSlug, id);
  if (!current) throw new Error('FILE_NOT_FOUND');
  const collision = await getProjectFileByPath(projectSlug, normalizedPath);
  if (collision && collision.id !== id) throw new Error('FILE_EXISTS');
  await database.update(boardProjectFiles).set({ path: normalizedPath, updatedAt: new Date().toISOString() }).where(and(eq(boardProjectFiles.projectSlug, projectSlug), eq(boardProjectFiles.id, id)));
  const row = (await database.select().from(boardProjectFiles).where(and(eq(boardProjectFiles.projectSlug, projectSlug), eq(boardProjectFiles.id, id))).limit(1))[0];
  if (!row) throw new Error('The file could not be loaded after moving.');
  return fileFromRow(row);
}

export async function deleteProjectFile(projectSlug: string, id: string) {
  await ensureSchema();
  await requireDatabase().delete(boardProjectFiles).where(and(eq(boardProjectFiles.projectSlug, projectSlug), eq(boardProjectFiles.id, id)));
}

export async function deleteProjectFolder(projectSlug: string, path: string) {
  await ensureSchema();
  const normalizedPath = normalizeProjectPath(path);
  const [files, folders] = await Promise.all([listProjectFiles(projectSlug), listProjectFolders(projectSlug)]);
  const prefix = `${normalizedPath}/`;
  if (files.some((file) => file.path === normalizedPath || file.path.startsWith(prefix)) || folders.some((folder) => folder.path !== normalizedPath && folder.path.startsWith(prefix))) throw new Error('FOLDER_NOT_EMPTY');
  await requireDatabase().delete(boardProjectFolders).where(and(eq(boardProjectFolders.projectSlug, projectSlug), eq(boardProjectFolders.path, normalizedPath)));
}

async function replaceCardTags(projectSlug: string, cardId: string, tagIds: string[], database = requireDatabase()) {
  const uniqueIds = [...new Set(tagIds.filter(Boolean))].slice(0, 12);
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

export async function listProjectCards(projectSlug: string, username = ''): Promise<ProjectCard[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const database = requireDatabase();
  const rows = await database.select().from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug)).orderBy(boardProjectCards.lane, boardProjectCards.position, boardProjectCards.createdAt, boardProjectCards.id);
  const tags = await listProjectTags(projectSlug);
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const cardTags = rows.length ? await database.select({ cardId: boardProjectCardTags.cardId, tagId: boardProjectCardTags.tagId }).from(boardProjectCardTags).where(inArray(boardProjectCardTags.cardId, rows.map((row) => row.id))) : [];
  const watchers = rows.length ? await database.select({ cardId: boardProjectCardWatchers.cardId, username: boardProjectCardWatchers.username }).from(boardProjectCardWatchers).where(inArray(boardProjectCardWatchers.cardId, rows.map((row) => row.id))) : [];
  const watcherCounts = new Map<string, number>();
  const watchedByUser = new Set<string>();
  for (const watcher of watchers) {
    watcherCounts.set(watcher.cardId, (watcherCounts.get(watcher.cardId) ?? 0) + 1);
    if (username && watcher.username === username) watchedByUser.add(watcher.cardId);
  }
  const tagsByCard = new Map<string, ProjectTag[]>();
  for (const entry of cardTags) {
    const tag = tagById.get(entry.tagId);
    if (tag) tagsByCard.set(entry.cardId, [...(tagsByCard.get(entry.cardId) ?? []), tag]);
  }
  return rows.map((row) => ({ id: row.id, projectSlug: row.projectSlug, title: row.title, details: row.details, lane: row.lane, position: row.position, archived: row.archived, checklist: parseChecklist(row.checklist), coverColor: row.coverColor, watcherCount: watcherCounts.get(row.id) ?? 0, watching: watchedByUser.has(row.id), owner: row.owner, priority: row.priority, dueDate: row.dueDate, tags: tagsByCard.get(row.id) ?? [], createdAt: row.createdAt, updatedAt: row.updatedAt }));
}

type ProjectCardWrite = Pick<ProjectCard, 'id' | 'projectSlug' | 'title' | 'details' | 'lane' | 'owner' | 'priority' | 'dueDate' | 'archived' | 'checklist' | 'coverColor'> & { tagIds?: string[] };

export async function createProjectCard(card: ProjectCardWrite) {
  await ensureSchema();
  const { tagIds = [], checklist = [], ...values } = card;
  const database = requireDatabase();
  const laneCards = await database.select({ position: boardProjectCards.position }).from(boardProjectCards).where(and(eq(boardProjectCards.projectSlug, card.projectSlug), eq(boardProjectCards.lane, card.lane)));
  const position = laneCards.reduce((max, item) => Math.max(max, item.position), -1) + 1;
  await database.transaction(async (tx) => {
    await tx.insert(boardProjectCards).values({ ...values, checklist: JSON.stringify(checklist), coverColor: values.coverColor || '', position });
    await replaceCardTags(card.projectSlug, card.id, tagIds, tx as any);
  });
}

export async function updateProjectCard(card: ProjectCardWrite) {
  await ensureSchema();
  const { tagIds = [], checklist = [], ...values } = card;
  const database = requireDatabase();
  await database.transaction(async (tx) => {
    await tx.update(boardProjectCards).set({ title: values.title, details: values.details, lane: values.lane, owner: values.owner, priority: values.priority, dueDate: values.dueDate, archived: values.archived, checklist: JSON.stringify(checklist), coverColor: values.coverColor || '', updatedAt: new Date().toISOString() }).where(and(eq(boardProjectCards.id, values.id), eq(boardProjectCards.projectSlug, values.projectSlug)));
    await replaceCardTags(card.projectSlug, card.id, tagIds, tx as any);
  });
}

export async function reorderProjectCard(projectSlug: string, cardId: string, lane: string, beforeId = '') {
  await ensureSchema();
  const database = requireDatabase();
  await database.transaction(async (tx: any) => {
    const rows = await tx.select().from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug)).orderBy(boardProjectCards.lane, boardProjectCards.position, boardProjectCards.createdAt, boardProjectCards.id);
    const moving = rows.find((row: typeof rows[number]) => row.id === cardId);
    if (!moving) throw new Error('Card not found.');
    const destination = rows.filter((row: typeof rows[number]) => row.lane === lane && row.id !== cardId);
    if (beforeId && !destination.some((row: typeof rows[number]) => row.id === beforeId)) throw new Error('Destination card not found.');
    const insertAt = beforeId ? destination.findIndex((row: typeof rows[number]) => row.id === beforeId) : destination.length;
    destination.splice(insertAt < 0 ? destination.length : insertAt, 0, { ...moving, lane });
    const updates = new Map<string, { lane: string; position: number }>();
    for (const [index, row] of destination.entries()) updates.set(row.id, { lane, position: index });
    const otherLanes = new Map<string, typeof rows>();
    for (const row of rows) {
      if (row.lane === lane || row.id === cardId) continue;
      otherLanes.set(row.lane, [...(otherLanes.get(row.lane) ?? []), row]);
    }
    for (const [otherLane, laneRows] of otherLanes) for (const [index, row] of laneRows.entries()) updates.set(row.id, { lane: otherLane, position: index });
    for (const [id, update] of updates) await tx.update(boardProjectCards).set({ lane: update.lane, position: update.position, updatedAt: new Date().toISOString() }).where(and(eq(boardProjectCards.id, id), eq(boardProjectCards.projectSlug, projectSlug)));
  });
}

/** Persist the complete board order in one transaction. Sending the full
 * snapshot makes rapid drag operations last-write-wins and prevents partial
 * lane updates when several moves happen before the network settles. */
export async function setProjectCardOrder(projectSlug: string, order: Array<{ id: string; lane: string; position: number }>) {
  await ensureSchema();
  const database = requireDatabase();
  await database.transaction(async (tx: any) => {
    const rows = await tx.select({ id: boardProjectCards.id }).from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug));
    const expected = new Set(rows.map((row: { id: string }) => row.id));
    if (order.length !== expected.size || new Set(order.map((item) => item.id)).size !== order.length || order.some((item) => !expected.has(item.id) || !item.lane || !Number.isInteger(item.position) || item.position < 0)) {
      throw new Error('The board order is stale or invalid.');
    }
    const now = new Date().toISOString();
    for (const item of order) {
      await tx.update(boardProjectCards).set({ lane: item.lane, position: item.position, updatedAt: now }).where(and(eq(boardProjectCards.id, item.id), eq(boardProjectCards.projectSlug, projectSlug)));
    }
  });
}

/** Keep cards attached to a column when its visible name is changed. */
export async function renameProjectLanes(projectSlug: string, renames: Array<{ from: string; to: string }>) {
  const changes = renames.filter((rename) => rename.from && rename.to && rename.from !== rename.to);
  if (!changes.length) return;
  await ensureSchema();
  const database = requireDatabase();
  await database.transaction(async (tx: any) => {
    const now = new Date().toISOString();
    const staged = changes.map((rename, index) => ({ ...rename, temporary: `__lane_rename_${Date.now()}_${index}_${randomBytes(3).toString('hex')}` }));
    for (const rename of staged) {
      await tx.update(boardProjectCards).set({ lane: rename.temporary, updatedAt: now }).where(and(eq(boardProjectCards.projectSlug, projectSlug), eq(boardProjectCards.lane, rename.from)));
    }
    for (const rename of staged) {
      await tx.update(boardProjectCards).set({ lane: rename.to, updatedAt: now }).where(and(eq(boardProjectCards.projectSlug, projectSlug), eq(boardProjectCards.lane, rename.temporary)));
    }
  });
}

export async function deleteProjectCard(projectSlug: string, id: string) {
  await ensureSchema();
  const database = requireDatabase();
  await database.transaction(async (tx) => {
    await tx.delete(boardProjectCardTags).where(eq(boardProjectCardTags.cardId, id));
    await tx.delete(boardProjectCardWatchers).where(eq(boardProjectCardWatchers.cardId, id));
    await tx.delete(boardProjectComments).where(and(eq(boardProjectComments.projectSlug, projectSlug), eq(boardProjectComments.cardId, id)));
    await tx.delete(boardProjectCards).where(and(eq(boardProjectCards.id, id), eq(boardProjectCards.projectSlug, projectSlug)));
  });
}

export async function setProjectCardWatching(projectSlug: string, cardId: string, username: string, watching: boolean) {
  await ensureSchema();
  const database = requireDatabase();
  if (watching) await database.insert(boardProjectCardWatchers).values({ cardId, username }).onConflictDoNothing();
  else await database.delete(boardProjectCardWatchers).where(and(eq(boardProjectCardWatchers.cardId, cardId), eq(boardProjectCardWatchers.username, username)));
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

export async function listProjectComments(projectSlug: string, cardId?: string, limit = 100): Promise<ProjectComment[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const conditions = cardId ? and(eq(boardProjectComments.projectSlug, projectSlug), eq(boardProjectComments.cardId, cardId)) : eq(boardProjectComments.projectSlug, projectSlug);
  const rows = await requireDatabase().select().from(boardProjectComments).where(conditions).orderBy(desc(boardProjectComments.createdAt), desc(boardProjectComments.id)).limit(limit);
  return rows.map((row) => ({ id: String(row.id), projectSlug: row.projectSlug, cardId: row.cardId, author: row.author, body: row.body, createdAt: row.createdAt }));
}

export async function createProjectComment(projectSlug: string, cardId: string, author: string, body: string): Promise<ProjectComment> {
  await ensureSchema();
  const cleanBody = body.trim().slice(0, 4000);
  if (!cleanBody) throw new Error('COMMENT_EMPTY');
  const inserted = await requireDatabase().insert(boardProjectComments).values({ projectSlug, cardId, author: author.trim().slice(0, 120) || 'unknown', body: cleanBody }).returning();
  const row = inserted[0];
  if (!row) throw new Error('The comment could not be saved.');
  return { id: String(row.id), projectSlug: row.projectSlug, cardId: row.cardId, author: row.author, body: row.body, createdAt: row.createdAt };
}

export async function deleteProjectComment(projectSlug: string, id: string, author: string, canDeleteAny = false) {
  await ensureSchema();
  const database = requireDatabase();
  const condition = canDeleteAny ? and(eq(boardProjectComments.projectSlug, projectSlug), eq(boardProjectComments.id, Number(id))) : and(eq(boardProjectComments.projectSlug, projectSlug), eq(boardProjectComments.id, Number(id)), eq(boardProjectComments.author, author));
  await database.delete(boardProjectComments).where(condition);
}

function graphSettings(value: string | null | undefined, revision: number): GraphSettings {
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(value ?? '{}') as Record<string, unknown>; } catch { /* use defaults */ }
  return {
    revision,
    snap: parsed.snap !== false,
    gridSize: typeof parsed.gridSize === 'number' && parsed.gridSize >= 4 && parsed.gridSize <= 64 ? Math.round(parsed.gridSize) : 8,
    background: parsed.background === 'ocean' || parsed.background === 'light' ? parsed.background : 'midnight'
  };
}

async function ensureProjectGraph(projectSlug: string) {
  const database = requireDatabase();
  await database.insert(boardProjectGraphs).values({ projectSlug, revision: 1, settings: JSON.stringify({ snap: true, gridSize: 8, background: 'midnight' }) }).onConflictDoNothing();
}

export async function loadProjectGraph(projectSlug: string): Promise<{ settings: GraphSettings; nodes: GraphNode[]; edges: GraphEdge[] }> {
  if (!databaseConfigured()) return { settings: { revision: 1, snap: true, gridSize: 8, background: 'midnight' }, nodes: [], edges: [] };
  await ensureSchema();
  await ensureProjectGraph(projectSlug);
  const database = requireDatabase();
  const graph = (await database.select().from(boardProjectGraphs).where(eq(boardProjectGraphs.projectSlug, projectSlug)).limit(1))[0];
  const nodeRows = await database.select().from(boardProjectGraphNodes).where(eq(boardProjectGraphNodes.projectSlug, projectSlug)).orderBy(boardProjectGraphNodes.createdAt, boardProjectGraphNodes.id);
  const edgeRows = await database.select().from(boardProjectGraphEdges).where(eq(boardProjectGraphEdges.projectSlug, projectSlug)).orderBy(boardProjectGraphEdges.createdAt, boardProjectGraphEdges.id);
  return {
    settings: graphSettings(graph?.settings, graph?.revision ?? 1),
    nodes: nodeRows.map((row) => ({ id: row.id, projectSlug: row.projectSlug, kind: row.kind, cardId: row.cardId, title: row.title, body: row.body, x: row.x, y: row.y, width: row.width, height: row.height, color: row.color, collapsed: row.collapsed, archived: row.archived, createdBy: row.createdBy, createdAt: row.createdAt, updatedAt: row.updatedAt })),
    edges: edgeRows.map((row) => ({ id: row.id, projectSlug: row.projectSlug, sourceNodeId: row.sourceNodeId, targetNodeId: row.targetNodeId, kind: row.kind, label: row.label, createdBy: row.createdBy, createdAt: row.createdAt, updatedAt: row.updatedAt }))
  };
}

async function bumpGraphRevision(projectSlug: string, expectedRevision?: number, database: any = requireDatabase()) {
  const where = expectedRevision === undefined ? eq(boardProjectGraphs.projectSlug, projectSlug) : and(eq(boardProjectGraphs.projectSlug, projectSlug), eq(boardProjectGraphs.revision, expectedRevision));
  const rows = await database.update(boardProjectGraphs).set({ revision: sql`${boardProjectGraphs.revision} + 1`, updatedAt: new Date().toISOString() }).where(where).returning({ revision: boardProjectGraphs.revision });
  if (!rows[0]) throw new Error('GRAPH_CONFLICT');
  return rows[0].revision;
}

export async function createGraphNode(node: Omit<GraphNode, 'createdAt' | 'updatedAt'>) {
  await ensureSchema();
  await ensureProjectGraph(node.projectSlug);
  const values = { ...node, title: node.title.trim().slice(0, 160), body: node.body.trim().slice(0, 4000), x: Math.round(node.x), y: Math.round(node.y), width: Math.max(160, Math.min(640, Math.round(node.width))), height: Math.max(80, Math.min(640, Math.round(node.height))) };
  await requireDatabase().insert(boardProjectGraphNodes).values(values);
  return bumpGraphRevision(node.projectSlug);
}

export async function updateGraphNode(projectSlug: string, nodeId: string, values: Partial<Pick<GraphNode, 'title' | 'body' | 'x' | 'y' | 'width' | 'height' | 'color' | 'collapsed' | 'archived' | 'cardId'>>, expectedRevision?: number) {
  await ensureSchema();
  const update = { ...values, ...(values.title !== undefined ? { title: values.title.trim().slice(0, 160) } : {}), ...(values.body !== undefined ? { body: values.body.trim().slice(0, 4000) } : {}), ...(values.x !== undefined ? { x: Math.round(values.x) } : {}), ...(values.y !== undefined ? { y: Math.round(values.y) } : {}), updatedAt: new Date().toISOString() };
  const database = requireDatabase();
  if (expectedRevision === undefined) {
    await database.update(boardProjectGraphNodes).set(update).where(and(eq(boardProjectGraphNodes.projectSlug, projectSlug), eq(boardProjectGraphNodes.id, nodeId)));
    return bumpGraphRevision(projectSlug);
  }
  return database.transaction(async (tx) => {
    await tx.update(boardProjectGraphNodes).set(update).where(and(eq(boardProjectGraphNodes.projectSlug, projectSlug), eq(boardProjectGraphNodes.id, nodeId)));
    return bumpGraphRevision(projectSlug, expectedRevision, tx);
  });
}

export async function deleteGraphNode(projectSlug: string, nodeId: string, expectedRevision?: number) {
  await ensureSchema();
  const database = requireDatabase();
  const remove = async (tx: any) => {
    await tx.delete(boardProjectGraphEdges).where(and(eq(boardProjectGraphEdges.projectSlug, projectSlug), eq(boardProjectGraphEdges.sourceNodeId, nodeId)));
    await tx.delete(boardProjectGraphEdges).where(and(eq(boardProjectGraphEdges.projectSlug, projectSlug), eq(boardProjectGraphEdges.targetNodeId, nodeId)));
    await tx.delete(boardProjectGraphNodes).where(and(eq(boardProjectGraphNodes.projectSlug, projectSlug), eq(boardProjectGraphNodes.id, nodeId)));
    return bumpGraphRevision(projectSlug, expectedRevision, tx);
  };
  return expectedRevision === undefined ? remove(database) : database.transaction(remove);
}

export async function createGraphEdge(edge: Omit<GraphEdge, 'createdAt' | 'updatedAt'>, expectedRevision?: number) {
  await ensureSchema();
  await ensureProjectGraph(edge.projectSlug);
  if (edge.sourceNodeId === edge.targetNodeId) throw new Error('GRAPH_SELF_EDGE');
  const database = requireDatabase();
  const insert = async (tx: any) => {
    const nodes = await tx.select({ id: boardProjectGraphNodes.id }).from(boardProjectGraphNodes).where(and(eq(boardProjectGraphNodes.projectSlug, edge.projectSlug), inArray(boardProjectGraphNodes.id, [edge.sourceNodeId, edge.targetNodeId])));
    if (nodes.length !== 2) throw new Error('GRAPH_NODE_NOT_FOUND');
    await tx.insert(boardProjectGraphEdges).values({ ...edge, label: edge.label.trim().slice(0, 120) });
    return bumpGraphRevision(edge.projectSlug, expectedRevision, tx);
  };
  return expectedRevision === undefined ? insert(database) : database.transaction(insert);
}

export async function deleteGraphEdge(projectSlug: string, edgeId: string, expectedRevision?: number) {
  await ensureSchema();
  const database = requireDatabase();
  const remove = async (tx: any) => {
    await tx.delete(boardProjectGraphEdges).where(and(eq(boardProjectGraphEdges.projectSlug, projectSlug), eq(boardProjectGraphEdges.id, edgeId)));
    return bumpGraphRevision(projectSlug, expectedRevision, tx);
  };
  return expectedRevision === undefined ? remove(database) : database.transaction(remove);
}

export async function saveGraphSettings(projectSlug: string, settings: Pick<GraphSettings, 'snap' | 'gridSize' | 'background'>, expectedRevision?: number) {
  await ensureSchema();
  await ensureProjectGraph(projectSlug);
  const clean = graphSettings(JSON.stringify(settings), 1);
  const database = requireDatabase();
  if (expectedRevision === undefined) {
    await database.update(boardProjectGraphs).set({ settings: JSON.stringify({ snap: clean.snap, gridSize: clean.gridSize, background: clean.background }), updatedAt: new Date().toISOString() }).where(eq(boardProjectGraphs.projectSlug, projectSlug));
    return bumpGraphRevision(projectSlug);
  }
  return database.transaction(async (tx) => {
    await tx.update(boardProjectGraphs).set({ settings: JSON.stringify({ snap: clean.snap, gridSize: clean.gridSize, background: clean.background }), updatedAt: new Date().toISOString() }).where(and(eq(boardProjectGraphs.projectSlug, projectSlug), eq(boardProjectGraphs.revision, expectedRevision)));
    return bumpGraphRevision(projectSlug, expectedRevision, tx);
  });
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
