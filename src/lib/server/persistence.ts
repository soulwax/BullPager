import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { BoardProject, BoardUser, GraphEdge, GraphEdgeKind, GraphNode, GraphNodeKind, GraphSettings, Packet, PacketNote, PacketState, ProjectActivity, ProjectCard, ProjectCardAttachment, ProjectChecklistItem, ProjectComment, ProjectFile, ProjectFolder, ProjectTag, ProjectViewState, SearchCardResult, SearchHit, TransitionRecord, UserRole, WikiPage, WikiRevision } from '$lib/types';
import { defaultProjectTags, slugifyTag, tagColors, tagId, tagPalette } from '$lib/projectTags';
import { isValidPageId, pageIdFromPath, parseWikiFile, serializeWikiFile, titleFor, wikiPathFor, WIKI_ROOT } from '$lib/wikiFiles';
import { snippetAround } from '$lib/searchSnippet';
import { parseCardRefs } from '$lib/wikiLinks';
import { databaseConfigured, db, neonClient } from './db';
import { cacheDelete, cached } from './cache';
import { boardProjectActivity, boardProjectCardAttachments, boardProjectCardTags, boardProjectCards, boardProjectCardWatchers, boardProjectComments, boardProjectFiles, boardProjectFolders, boardProjectGraphEdges, boardProjectWikiRevisions, boardProjectGraphNodes, boardProjectGraphs, boardProjectStars, boardProjectTags, boardProjectViews, boardProjects, boardSessions, boardSettings, boardUsers, loginAttempts, packetNotes, packetTransitions } from './db/schema';

/** Card description/detail length before the sync appends a truncation marker
 * instead of silently cutting the text mid-sentence. */
export const CARD_DETAILS_LIMIT = 8000;
/** Upper bound on synced checklist items per card; matches the packet handle
 * cap in `parsePackets` so a fully handle-decomposed packet never loses one. */
export const MAX_PACKET_CHECKLIST_ITEMS = 40;

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

/** A real round-trip, not just "is DATABASE_URL set" — for the `/health`
 * endpoint, where the whole point is catching a configured-but-unreachable
 * database (wrong credentials, network policy, a paused Neon branch). */
export async function databaseHealthy(): Promise<boolean> {
  if (!databaseConfigured() || !rawSql) return false;
  try {
    await rawSql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

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
    CREATE TABLE IF NOT EXISTS board_project_stars (
      username TEXT NOT NULL,
      project_slug TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (username, project_slug)
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_project_card_attachments (
      id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL,
      card_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'unknown',
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
    CREATE TABLE IF NOT EXISTS board_project_wiki_revisions (
      id BIGSERIAL PRIMARY KEY,
      page_id TEXT NOT NULL,
      project_slug TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      edited_by TEXT NOT NULL DEFAULT 'unknown',
      summary TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  `, rawSql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id BIGSERIAL PRIMARY KEY,
      attempt_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, rawSql`
    CREATE TABLE IF NOT EXISTS board_sessions (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `]);
  // Each rawSql call above is its own HTTP round-trip with no ordering
  // guarantee between them, so an index on a table created in that same
  // Promise.all can race ahead of the CREATE TABLE and fail — this one runs
  // sequentially after, once the table is guaranteed to exist.
  await rawSql`CREATE INDEX IF NOT EXISTS login_attempts_key_created_idx ON login_attempts (attempt_key, created_at)`;
  await rawSql`CREATE INDEX IF NOT EXISTS board_sessions_username_idx ON board_sessions (username)`;
  await rawSql`ALTER TABLE board_project_cards ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal', ADD COLUMN IF NOT EXISTS due_date DATE, ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS checklist TEXT NOT NULL DEFAULT '[]', ADD COLUMN IF NOT EXISTS cover_color TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS due_complete BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS start_date DATE, ADD COLUMN IF NOT EXISTS card_number INTEGER`;
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

export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/** Counts recent failed logins for one client-address+username pair — not a
 * global cap, so a brute-force script against one account from one address
 * is throttled without penalizing unrelated logins sharing an office IP. */
export async function recentLoginFailures(attemptKey: string): Promise<number> {
  if (!databaseConfigured()) return 0;
  await ensureSchema();
  const cutoff = new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MS).toISOString();
  const rows = await requireDatabase().select({ id: loginAttempts.id }).from(loginAttempts).where(and(eq(loginAttempts.attemptKey, attemptKey), gte(loginAttempts.createdAt, cutoff)));
  return rows.length;
}

/** Also prunes attempt rows past the window on the same call, so the table
 * self-cleans without a cron job — cheap given the window is only 15 minutes. */
export async function recordLoginFailure(attemptKey: string): Promise<void> {
  if (!databaseConfigured()) return;
  await ensureSchema();
  const database = requireDatabase();
  const cutoff = new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MS).toISOString();
  await database.insert(loginAttempts).values({ attemptKey });
  await database.delete(loginAttempts).where(lt(loginAttempts.createdAt, cutoff));
}

export async function clearLoginFailures(attemptKey: string): Promise<void> {
  if (!databaseConfigured()) return;
  await ensureSchema();
  await requireDatabase().delete(loginAttempts).where(eq(loginAttempts.attemptKey, attemptKey));
}

export async function recordSession(sessionId: string, username: string): Promise<void> {
  if (!databaseConfigured()) return;
  await ensureSchema();
  await requireDatabase().insert(boardSessions).values({ id: sessionId, username });
}

/** Fails open (treats the session as not revoked) when persistence is
 * unavailable, rather than locking everyone out — the signed token's own
 * signature and expiry, checked before this ever runs, remain the primary
 * security boundary; this only adds the ability to kill a token early. */
export async function isSessionRevoked(sessionId: string): Promise<boolean> {
  if (!databaseConfigured()) return false;
  try {
    await ensureSchema();
    const rows = await requireDatabase().select({ revokedAt: boardSessions.revokedAt }).from(boardSessions).where(eq(boardSessions.id, sessionId)).limit(1);
    return rows[0]?.revokedAt != null;
  } catch (error) {
    console.error('[session check] treating an unreadable session store as not revoked', error);
    return false;
  }
}

export async function revokeSession(sessionId: string): Promise<void> {
  if (!databaseConfigured()) return;
  await ensureSchema();
  await requireDatabase().update(boardSessions).set({ revokedAt: new Date().toISOString() }).where(eq(boardSessions.id, sessionId));
}

/** Used by "sign out everywhere" and by account deletion — a token issued
 * before either action stops working on its very next request. */
export async function revokeAllSessionsForUser(username: string): Promise<void> {
  if (!databaseConfigured()) return;
  await ensureSchema();
  await requireDatabase().update(boardSessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(boardSessions.username, username), sql`${boardSessions.revokedAt} IS NULL`));
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

/** Per-project card totals for the board list. One grouped query rather than
 * one per project, so the home page cost does not grow with the board count. */
/** Short enough that a card added on one board shows in the home tile count
 * almost immediately, long enough to absorb the repeat loads of someone
 * moving between boards. Card mutations clear it outright via
 * `invalidateProjectCounts`, so the TTL is only a backstop. */
export const PROJECT_COUNTS_TTL_SECONDS = 60;
const PROJECT_COUNTS_KEY = 'projects:counts';

/** Called by every path that changes how many cards a board has. */
export async function invalidateProjectCounts(): Promise<void> {
  await cacheDelete(PROJECT_COUNTS_KEY);
}

export async function listProjectCounts(): Promise<Record<string, { active: number; total: number }>> {
  if (!databaseConfigured()) return {};
  return cached(PROJECT_COUNTS_KEY, PROJECT_COUNTS_TTL_SECONDS, listProjectCountsUncached);
}

async function listProjectCountsUncached(): Promise<Record<string, { active: number; total: number }>> {
  await ensureSchema();
  const rows = await requireDatabase()
    .select({
      slug: boardProjectCards.projectSlug,
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${boardProjectCards.archived} = false)::int`
    })
    .from(boardProjectCards)
    .groupBy(boardProjectCards.projectSlug);
  return Object.fromEntries(rows.map((row) => [row.slug, { active: Number(row.active), total: Number(row.total) }]));
}

export async function listBoardProjects(): Promise<BoardProject[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const rows = await requireDatabase().select().from(boardProjects).orderBy(boardProjects.name);
  return rows.map((row) => ({ slug: row.slug, name: row.name, owner: row.owner, visibility: row.visibility }));
}

/** Global search across every board's cards — the top-bar search a Trello
 * user reaches for, rather than only the per-board filter. Every project is
 * visible to every signed-in user today (there is no per-project ACL), so
 * this intentionally does not take a username to scope results by. */
export async function searchProjectCards(query: string, limit = 20): Promise<SearchCardResult[]> {
  if (!databaseConfigured()) return [];
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];
  await ensureSchema();
  const pattern = `%${cleanQuery.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
  const rows = await requireDatabase()
    .select({ cardId: boardProjectCards.id, cardNumber: boardProjectCards.cardNumber, title: boardProjectCards.title, lane: boardProjectCards.lane, priority: boardProjectCards.priority, archived: boardProjectCards.archived, projectSlug: boardProjectCards.projectSlug, projectName: boardProjects.name })
    .from(boardProjectCards)
    .innerJoin(boardProjects, eq(boardProjects.slug, boardProjectCards.projectSlug))
    .where(or(ilike(boardProjectCards.title, pattern), ilike(boardProjectCards.details, pattern)))
    .orderBy(boardProjectCards.archived, desc(boardProjectCards.updatedAt))
    .limit(Math.min(Math.max(1, limit), 50));
  return rows.map((row) => ({ ...row, cardNumber: row.cardNumber ?? 0 }));
}

/**
 * Global search across every pillar: board cards, wiki pages, and cloud files.
 *
 * Three separate queries rather than one SQL union, because the three rank and
 * shape differently and a union would have to flatten them into a lowest
 * common denominator anyway. They run concurrently, so the cost is one round
 * trip, and the endpoint caches the whole thing in Redis.
 *
 * Wiki pages and files come from the same table — a wiki page *is* a file at
 * `wiki/**.md` — so the file query excludes that prefix. Without it every wiki
 * page would appear twice, once under each heading.
 */
/**
 * Four per kind, not more: the point of a cross-pillar search is seeing that a
 * word appears in the wiki *and* on a card. A generous card limit pushes the
 * other two groups below the fold and quietly restores the card-only search
 * this replaced.
 */
export async function searchProjectContent(query: string, limitPerKind = 4): Promise<SearchHit[]> {
  if (!databaseConfigured()) return [];
  const clean = query.trim();
  if (clean.length < 2) return [];
  await ensureSchema();
  const pattern = `%${clean.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
  const database = requireDatabase();
  const take = Math.min(Math.max(1, limitPerKind), 20);
  const wikiPrefix = `${WIKI_ROOT}/%`;

  const [cards, files] = await Promise.all([
    database
      .select({
        id: boardProjectCards.id,
        cardNumber: boardProjectCards.cardNumber,
        title: boardProjectCards.title,
        details: boardProjectCards.details,
        lane: boardProjectCards.lane,
        archived: boardProjectCards.archived,
        projectSlug: boardProjectCards.projectSlug,
        projectName: boardProjects.name
      })
      .from(boardProjectCards)
      .innerJoin(boardProjects, eq(boardProjects.slug, boardProjectCards.projectSlug))
      .where(or(ilike(boardProjectCards.title, pattern), ilike(boardProjectCards.details, pattern)))
      .orderBy(boardProjectCards.archived, desc(boardProjectCards.updatedAt))
      .limit(take),
    database
      .select({
        id: boardProjectFiles.id,
        path: boardProjectFiles.path,
        content: boardProjectFiles.content,
        mimeType: boardProjectFiles.mimeType,
        projectSlug: boardProjectFiles.projectSlug,
        projectName: boardProjects.name
      })
      .from(boardProjectFiles)
      .innerJoin(boardProjects, eq(boardProjects.slug, boardProjectFiles.projectSlug))
      .where(or(ilike(boardProjectFiles.path, pattern), ilike(boardProjectFiles.content, pattern)))
      .orderBy(desc(boardProjectFiles.updatedAt))
      .limit(take * 3)
  ]);

  const hits: SearchHit[] = cards.map((row) => ({
    kind: 'card' as const,
    id: row.id,
    cardNumber: row.cardNumber ?? 0,
    title: row.title,
    href: `/projects/${row.projectSlug}?card=${encodeURIComponent(row.id)}`,
    projectSlug: row.projectSlug,
    projectName: row.projectName,
    meta: row.lane,
    snippet: snippetAround(row.details ?? '', clean),
    archived: row.archived
  }));

  const wiki: SearchHit[] = [];
  const plain: SearchHit[] = [];
  for (const row of files) {
    const pageId = pageIdFromPath(row.path);
    if (pageId) {
      const { meta, body } = parseWikiFile(row.content);
      wiki.push({
        kind: 'wiki',
        id: row.id,
        title: titleFor(pageId, meta, body),
        href: `/projects/${row.projectSlug}/wiki/${pageId}`,
        projectSlug: row.projectSlug,
        projectName: row.projectName,
        meta: row.path,
        snippet: snippetAround(body, clean),
        archived: false
      });
    } else {
      plain.push({
        kind: 'file',
        id: row.id,
        title: row.path.split('/').pop() ?? row.path,
        href: `/projects/${row.projectSlug}/files?file=${encodeURIComponent(row.path)}`,
        projectSlug: row.projectSlug,
        projectName: row.projectName,
        meta: row.path,
        // A binary file has no readable content; its path is the only context.
        snippet: row.mimeType.startsWith('text/') ? snippetAround(row.content, clean) : row.mimeType,
        archived: false
      });
    }
  }

  return [...hits, ...wiki.slice(0, take), ...plain.slice(0, take)];
}

/**
 * Which wiki pages cite which card, for one project.
 *
 * Returned as a map keyed by card number so the board can look up any card in
 * one pass — computing this per open card would re-read and re-parse the whole
 * wiki every time the drawer opens.
 *
 * The wiki is small (tens of pages) and already in the file table, so parsing
 * it on demand is cheaper than maintaining a link index that could drift out
 * of step with the files people edit directly in the cloud.
 */
export async function wikiCardReferences(projectSlug: string): Promise<Record<number, { pageId: string; title: string }[]>> {
  const pages = await listWikiPages(projectSlug);
  const byCard: Record<number, { pageId: string; title: string }[]> = {};
  for (const page of pages) {
    for (const ref of parseCardRefs(page.body)) {
      (byCard[ref.number] ??= []).push({ pageId: page.pageId, title: page.title });
    }
  }
  return byCard;
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

export async function updateProjectName(slug: string, name: string) {
  await ensureSchema();
  const cleanName = name.trim().slice(0, 120);
  if (!cleanName) throw new Error('Choose a board name.');
  await requireDatabase().update(boardProjects).set({ name: cleanName }).where(eq(boardProjects.slug, slug));
}

export async function listStarredProjectSlugs(username: string): Promise<Set<string>> {
  if (!databaseConfigured() || !username) return new Set();
  await ensureSchema();
  const rows = await requireDatabase().select({ projectSlug: boardProjectStars.projectSlug }).from(boardProjectStars).where(eq(boardProjectStars.username, username));
  return new Set(rows.map((row) => row.projectSlug));
}

export async function setProjectStar(username: string, projectSlug: string, starred: boolean) {
  await ensureSchema();
  const database = requireDatabase();
  if (starred) await database.insert(boardProjectStars).values({ username, projectSlug }).onConflictDoNothing();
  else await database.delete(boardProjectStars).where(and(eq(boardProjectStars.username, username), eq(boardProjectStars.projectSlug, projectSlug)));
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

/** One-time rename from the retired `MIG-*` packet-id prefix to `WARD-*`,
 * covering the card row itself, every table that stores a card id, and the
 * `mig-...` item ids embedded in the checklist JSON. Each statement matches
 * by LIKE independently, so this is safe to call on every planner sync: a
 * no-op once every row is renamed, and resumable if interrupted partway
 * through, since whichever tables didn't finish just get picked up again. */
async function renameLegacyPacketIds(projectSlug: string) {
  if (!rawSql) return;
  await Promise.all([
    rawSql`UPDATE board_project_card_tags SET card_id = regexp_replace(card_id, '^unity-mig-', 'unity-ward-') WHERE card_id LIKE 'unity-mig-%'`,
    rawSql`UPDATE board_project_card_watchers SET card_id = regexp_replace(card_id, '^unity-mig-', 'unity-ward-') WHERE card_id LIKE 'unity-mig-%'`,
    rawSql`UPDATE board_project_activity SET card_id = regexp_replace(card_id, '^unity-mig-', 'unity-ward-') WHERE card_id LIKE 'unity-mig-%'`,
    rawSql`UPDATE board_project_comments SET card_id = regexp_replace(card_id, '^unity-mig-', 'unity-ward-') WHERE card_id LIKE 'unity-mig-%'`,
    rawSql`UPDATE board_project_card_attachments SET card_id = regexp_replace(card_id, '^unity-mig-', 'unity-ward-') WHERE card_id LIKE 'unity-mig-%'`,
    rawSql`UPDATE board_project_graph_nodes SET card_id = regexp_replace(card_id, '^unity-mig-', 'unity-ward-') WHERE card_id LIKE 'unity-mig-%'`
  ]);
  await rawSql`
    UPDATE board_project_cards
    SET id = regexp_replace(id, '^unity-mig-', 'unity-ward-'),
        checklist = regexp_replace(checklist, '"id":"mig-', '"id":"ward-', 'g')
    WHERE project_slug = ${projectSlug} AND id LIKE 'unity-mig-%'
  `;
}

export async function syncUnityPlannerCards(packets: Packet[], options: { sourceDigest?: string; actor?: string; projectSlug?: string } = {}): Promise<number> {
  if (!databaseConfigured()) return 0;
  await ensureSchema();
  const database = requireDatabase();
  // Defaults to the real board every production call site relies on; tests
  // pass an isolated slug so WARD-04's coverage can run against the actual
  // database without ever touching a real packet's card.
  const projectSlug = options.projectSlug || 'unity-plan';
  await renameLegacyPacketIds(projectSlug);
  const owner = env.APP_LOGIN || 'superadmin';
  await database.insert(boardProjects).values({ slug: projectSlug, name: 'Unity implementation board', owner, visibility: 'private' }).onConflictDoNothing();
  await database.update(boardProjects).set({ name: 'Unity implementation board' }).where(and(eq(boardProjects.slug, projectSlug), inArray(boardProjects.name, ['Unity migration plan', 'Unity greenfield build plan'])));
  await database.insert(boardSettings).values({ key: `project_${projectSlug}_lanes`, value: JSON.stringify(['Backlog', 'In progress', 'Blocked', 'Done']) }).onConflictDoNothing();
  await database.insert(boardSettings).values({ key: `project_${projectSlug}_theme`, value: 'midnight' }).onConflictDoNothing();
  // Marks title/details/checklist-text/owner/priority/cover as source-owned in
  // the UI; board-owned fields (lane, dates, comments, watchers…) stay editable.
  await database.insert(boardSettings).values({ key: `project_${projectSlug}_source`, value: 'plan' }).onConflictDoNothing();
  await ensureDefaultProjectTags(projectSlug);
  await ensurePlannerTags(projectSlug, packets);
  const digestKey = `project_${projectSlug}_planner_digest`;
  const previousDigestRow = await database.select({ value: boardSettings.value }).from(boardSettings).where(eq(boardSettings.key, digestKey)).limit(1);
  const previousDigest = previousDigestRow[0]?.value || '';
  // The whole per-packet diff below is skippable once the source hasn't
  // changed: repeatedly opening the board must never write or log activity.
  if (options.sourceDigest && options.sourceDigest === previousDigest) return 0;
  const rows = await database.select().from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug));
  const existing = new Map(rows.map((row) => [row.id, row]));
  const positions = new Map<string, number>();
  const current = await database.select({ lane: boardProjectCards.lane, position: boardProjectCards.position }).from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug));
  for (const row of current) positions.set(row.lane, Math.max(positions.get(row.lane) ?? -1, row.position));
  const stateLane = (state: PacketState) => state === 'BLOCKED' ? 'Blocked' : state === 'ACTIVE' || state === 'PARTIAL' ? 'In progress' : state === 'CLOSED' || state === 'DROPPED' ? 'Done' : 'Backlog';
  const stateColor = (state: PacketState) => state === 'BLOCKED' ? '#F17878' : state === 'ACTIVE' || state === 'PARTIAL' ? '#5E9CFF' : state === 'CLOSED' ? '#68D6A4' : '#A7B1C2';
  const priority = (state: PacketState): ProjectCard['priority'] => state === 'BLOCKED' ? 'urgent' : state === 'ACTIVE' || state === 'PARTIAL' ? 'high' : state === 'CLOSED' || state === 'DROPPED' ? 'low' : 'normal';
  // The checklist is what a human ticks off, so it is built from the packet's
  // one-sitting handles (falling back to numbered/bulleted steps for source
  // text that predates handles). Item ids are stable across re-syncs so an
  // existing `done` flag can be matched and preserved below.
  const checklistItems = (packet: Packet): ProjectChecklistItem[] => {
    // The id is derived from the handle's own text, not its position in the
    // list. Handles get reordered and inserted as a packet's decomposition is
    // refined (exactly what happened when BUILD_MASTERPLAN.md §B.4 replaced
    // every packet's short handle list with the full one-sitting breakdown) —
    // a positional id like `ward-00-handle-2` would silently reattach an
    // earlier tick to a completely different new handle at the same index.
    // Once a packet has had its detail pass, each handle owns a step of the
    // form "N. `handle` — instruction". The checklist is the human's actual
    // worklist, so it carries that instruction rather than the bare slug; the
    // slug stays on the front for citing the handle in evidence. Un-detailed
    // packets keep showing the slug alone until their pass lands.
    const detailByHandle = new Map<string, string>(
      [...packet.steps.matchAll(/^\d+\.\s+`([a-z0-9-]+)`\s+—\s+(.+)$/gm)].map((match) => [match[1], match[2].trim()])
    );
    const fromHandles = (packet.handles ?? []).map((handle) => {
      const detail = detailByHandle.get(handle);
      return {
        id: `${packet.id.toLowerCase()}-${handle}`,
        text: (detail ? `${handle} — ${detail}` : handle).slice(0, 240),
        done: false
      };
    });
    if (fromHandles.length) return fromHandles.slice(0, MAX_PACKET_CHECKLIST_ITEMS);
    return packet.steps
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/)?.[1]?.trim())
      .filter((item): item is string => Boolean(item))
      .slice(0, MAX_PACKET_CHECKLIST_ITEMS)
      .map((text, index) => ({ id: `${packet.id.toLowerCase()}-step-${index + 1}`, text: text.slice(0, 240), done: false }));
  };
  const detailsFor = (packet: Packet) => {
    const body = [
      `Unity implementation packet ${packet.id}`,
      `Category: ${packet.category || 'Uncategorized'} · Subcategory: ${packet.subcategory || 'General'}`,
      packet.tags?.length ? `Tags: ${packet.tags.join(', ')}` : '',
      packet.runbook ? `Runbook:\n${packet.runbook}` : '',
      `Milestone: ${packet.milestone} · State: ${packet.state} · Owner: ${packet.owner || 'unassigned'}`,
      packet.outcome ? `Outcome: ${packet.outcome}` : '',
      packet.inputs ? `Inputs: ${packet.inputs}` : '',
      packet.files ? `Files: ${packet.files}` : '',
      packet.checks ? `Checks: ${packet.checks}` : '',
      packet.evidence ? `Evidence: ${packet.evidence}` : '',
      packet.remainder ? `Remainder: ${packet.remainder}` : '',
      packet.dependsOn.length ? `Depends on: ${packet.dependsOn.join(', ')}` : ''
    ].filter(Boolean).join('\n\n');
    return body.length > CARD_DETAILS_LIMIT ? `${body.slice(0, CARD_DETAILS_LIMIT)}\n\n[truncated — see the source packet for the rest]` : body;
  };
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
    // `board_project_cards.id` is a global text primary key, not scoped by
    // (projectSlug, id) — every card_id-keyed table (tags, watchers,
    // comments, activity) follows suit. That was safe while this function
    // had exactly one caller, always `projectSlug: 'unity-plan'`. Now that
    // WARD-04's own test suite calls it with an isolated slug, a bare
    // `unity-${packet.id}` id would collide with the SAME id already used by
    // the real production project — and onConflictDoNothing() would then
    // silently no-op the insert while still reporting it as a change. The
    // real project keeps its exact historical id format; any other slug gets
    // one disambiguated by that slug, so two callers can never collide.
    const id = projectSlug === 'unity-plan'
      ? `unity-${packet.id.toLowerCase()}`
      : `unity-${slugifyTag(projectSlug)}-${packet.id.toLowerCase()}`;
    const current = existing.get(id);
    // The item TEXT is source-owned; whether it is TICKED is board-owned.
    // Merge by item id so a completed handle survives an unrelated source
    // change instead of being reset to unchecked on the next sync.
    const existingDoneById = current ? new Map(parseChecklist(current.checklist).map((item) => [item.id, item.done])) : new Map<string, boolean>();
    const mergedChecklist = checklistItems(packet).map((item) => ({ id: item.id, text: item.text, done: existingDoneById.get(item.id) ?? false }));
    const sourceValues = {
      title: `${packet.id} · ${packet.title}`,
      details: detailsFor(packet),
      checklist: JSON.stringify(mergedChecklist),
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

/** One-time backfill for cards created before card numbers existed. Assigns
 * numbers in creation order so older cards keep lower numbers, same as if
 * numbering had been on since the first card. A no-op once every row has one. */
async function backfillCardNumbers(projectSlug: string) {
  if (!rawSql) return;
  await rawSql`
    UPDATE board_project_cards AS c
    SET card_number = sub.rn + coalesce((SELECT max(card_number) FROM board_project_cards WHERE project_slug = ${projectSlug}), 0)
    FROM (
      SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
      FROM board_project_cards
      WHERE project_slug = ${projectSlug} AND card_number IS NULL
    ) AS sub
    WHERE c.id = sub.id
  `;
}

export async function listProjectCards(projectSlug: string, username = ''): Promise<ProjectCard[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const database = requireDatabase();
  let rows = await database.select().from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug)).orderBy(boardProjectCards.lane, boardProjectCards.position, boardProjectCards.createdAt, boardProjectCards.id);
  if (rows.some((row) => row.cardNumber === null)) {
    await backfillCardNumbers(projectSlug);
    rows = await database.select().from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug)).orderBy(boardProjectCards.lane, boardProjectCards.position, boardProjectCards.createdAt, boardProjectCards.id);
  }
  const tags = await listProjectTags(projectSlug);
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const cardTags = rows.length ? await database.select({ cardId: boardProjectCardTags.cardId, tagId: boardProjectCardTags.tagId }).from(boardProjectCardTags).where(inArray(boardProjectCardTags.cardId, rows.map((row) => row.id))) : [];
  const watchers = rows.length ? await database.select({ cardId: boardProjectCardWatchers.cardId, username: boardProjectCardWatchers.username }).from(boardProjectCardWatchers).where(inArray(boardProjectCardWatchers.cardId, rows.map((row) => row.id))) : [];
  const attachmentRows = rows.length ? await database.select({ cardId: boardProjectCardAttachments.cardId }).from(boardProjectCardAttachments).where(inArray(boardProjectCardAttachments.cardId, rows.map((row) => row.id))) : [];
  const attachmentCounts = new Map<string, number>();
  for (const row of attachmentRows) attachmentCounts.set(row.cardId, (attachmentCounts.get(row.cardId) ?? 0) + 1);
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
  return rows.map((row) => ({ id: row.id, projectSlug: row.projectSlug, title: row.title, details: row.details, lane: row.lane, position: row.position, archived: row.archived, checklist: parseChecklist(row.checklist), coverColor: row.coverColor, watcherCount: watcherCounts.get(row.id) ?? 0, watching: watchedByUser.has(row.id), owner: row.owner, priority: row.priority, dueDate: row.dueDate, dueComplete: row.dueComplete, startDate: row.startDate, cardNumber: row.cardNumber ?? 0, attachmentCount: attachmentCounts.get(row.id) ?? 0, tags: tagsByCard.get(row.id) ?? [], createdAt: row.createdAt, updatedAt: row.updatedAt }));
}

function attachmentFromRow(row: typeof boardProjectCardAttachments.$inferSelect): ProjectCardAttachment {
  return { id: row.id, projectSlug: row.projectSlug, cardId: row.cardId, name: row.name, url: row.url, mimeType: row.mimeType, size: row.size, createdBy: row.createdBy, createdAt: row.createdAt };
}

export async function listCardAttachments(projectSlug: string, cardId?: string): Promise<ProjectCardAttachment[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const conditions = cardId ? and(eq(boardProjectCardAttachments.projectSlug, projectSlug), eq(boardProjectCardAttachments.cardId, cardId)) : eq(boardProjectCardAttachments.projectSlug, projectSlug);
  const rows = await requireDatabase().select().from(boardProjectCardAttachments).where(conditions).orderBy(desc(boardProjectCardAttachments.createdAt));
  return rows.map(attachmentFromRow);
}

export async function createCardAttachment(attachment: Omit<ProjectCardAttachment, 'createdAt'>): Promise<ProjectCardAttachment> {
  await ensureSchema();
  await requireDatabase().insert(boardProjectCardAttachments).values({ ...attachment, name: attachment.name.slice(0, 200), url: attachment.url.slice(0, 2000), mimeType: attachment.mimeType.slice(0, 120) });
  const row = (await requireDatabase().select().from(boardProjectCardAttachments).where(eq(boardProjectCardAttachments.id, attachment.id)).limit(1))[0];
  if (!row) throw new Error('The attachment could not be loaded after creation.');
  return attachmentFromRow(row);
}

export async function deleteCardAttachment(projectSlug: string, id: string) {
  await ensureSchema();
  await requireDatabase().delete(boardProjectCardAttachments).where(and(eq(boardProjectCardAttachments.projectSlug, projectSlug), eq(boardProjectCardAttachments.id, id)));
}

type ProjectCardWrite = Pick<ProjectCard, 'id' | 'projectSlug' | 'title' | 'details' | 'lane' | 'owner' | 'priority' | 'dueDate' | 'dueComplete' | 'startDate' | 'archived' | 'checklist' | 'coverColor'> & { tagIds?: string[] };

export async function createProjectCard(card: ProjectCardWrite) {
  await invalidateProjectCounts();
  await ensureSchema();
  const { tagIds = [], checklist = [], ...values } = card;
  const database = requireDatabase();
  const laneCards = await database.select({ position: boardProjectCards.position }).from(boardProjectCards).where(and(eq(boardProjectCards.projectSlug, card.projectSlug), eq(boardProjectCards.lane, card.lane)));
  const position = laneCards.reduce((max, item) => Math.max(max, item.position), -1) + 1;
  // Card numbers are permanent once assigned (matching Trello — duplicating a
  // card gets it a new number, never the source's). Computed from the current
  // max rather than a separate counter row, since card creation is low-volume
  // and this keeps the number in the same transaction as the insert.
  const [{ maxNumber }] = await database.select({ maxNumber: sql<number>`coalesce(max(${boardProjectCards.cardNumber}), 0)` }).from(boardProjectCards).where(eq(boardProjectCards.projectSlug, card.projectSlug));
  // Not wrapped in database.transaction(): the neon-http driver this project
  // uses for edge/serverless compatibility throws "No transactions support in
  // neon-http driver" the instant db.transaction() is called — every write
  // path in this file ran through that call, so every one of them failed on
  // a real Neon database until this fix. Sequential awaited statements over
  // the same `database` handle lose atomicity on a mid-sequence crash (rare)
  // in exchange for actually working (previously: always, 100% of the time).
  await database.insert(boardProjectCards).values({ ...values, checklist: JSON.stringify(checklist), coverColor: values.coverColor || '', position, cardNumber: maxNumber + 1 });
  await replaceCardTags(card.projectSlug, card.id, tagIds, database);
}

export async function updateProjectCard(card: ProjectCardWrite) {
  // Only an archive flip changes a tile's active/archived split.
  await invalidateProjectCounts();
  await ensureSchema();
  const { tagIds = [], checklist = [], ...values } = card;
  const database = requireDatabase();
  await database.update(boardProjectCards).set({ title: values.title, details: values.details, lane: values.lane, owner: values.owner, priority: values.priority, dueDate: values.dueDate, dueComplete: values.dueComplete, startDate: values.startDate, archived: values.archived, checklist: JSON.stringify(checklist), coverColor: values.coverColor || '', updatedAt: new Date().toISOString() }).where(and(eq(boardProjectCards.id, values.id), eq(boardProjectCards.projectSlug, values.projectSlug)));
  await replaceCardTags(card.projectSlug, card.id, tagIds, database);
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
  const otherLanes = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.lane === lane || row.id === cardId) continue;
    otherLanes.set(row.lane, [...(otherLanes.get(row.lane) ?? []), row]);
  }
  for (const [otherLane, laneRows] of otherLanes) for (const [index, row] of laneRows.entries()) updates.set(row.id, { lane: otherLane, position: index });
  for (const [id, update] of updates) await database.update(boardProjectCards).set({ lane: update.lane, position: update.position, updatedAt: new Date().toISOString() }).where(and(eq(boardProjectCards.id, id), eq(boardProjectCards.projectSlug, projectSlug)));
}

/** Persist the complete board order. Sending the full snapshot makes rapid
 * drag operations last-write-wins and prevents partial lane updates when
 * several moves happen before the network settles. */
export async function setProjectCardOrder(projectSlug: string, order: Array<{ id: string; lane: string; position: number }>) {
  await ensureSchema();
  const database = requireDatabase();
  const rows = await database.select({ id: boardProjectCards.id }).from(boardProjectCards).where(eq(boardProjectCards.projectSlug, projectSlug));
  const expected = new Set(rows.map((row) => row.id));
  if (order.length !== expected.size || new Set(order.map((item) => item.id)).size !== order.length || order.some((item) => !expected.has(item.id) || !item.lane || !Number.isInteger(item.position) || item.position < 0)) {
    throw new Error('The board order is stale or invalid.');
  }
  const now = new Date().toISOString();
  for (const item of order) {
    await database.update(boardProjectCards).set({ lane: item.lane, position: item.position, updatedAt: now }).where(and(eq(boardProjectCards.id, item.id), eq(boardProjectCards.projectSlug, projectSlug)));
  }
}

/** Keep cards attached to a column when its visible name is changed. */
export async function renameProjectLanes(projectSlug: string, renames: Array<{ from: string; to: string }>) {
  const changes = renames.filter((rename) => rename.from && rename.to && rename.from !== rename.to);
  if (!changes.length) return;
  await ensureSchema();
  const database = requireDatabase();
  const now = new Date().toISOString();
  const staged = changes.map((rename, index) => ({ ...rename, temporary: `__lane_rename_${Date.now()}_${index}_${randomBytes(3).toString('hex')}` }));
  for (const rename of staged) {
    await database.update(boardProjectCards).set({ lane: rename.temporary, updatedAt: now }).where(and(eq(boardProjectCards.projectSlug, projectSlug), eq(boardProjectCards.lane, rename.from)));
  }
  for (const rename of staged) {
    await database.update(boardProjectCards).set({ lane: rename.to, updatedAt: now }).where(and(eq(boardProjectCards.projectSlug, projectSlug), eq(boardProjectCards.lane, rename.temporary)));
  }
}

/** Move every non-archived card from one lane to another in one pass,
 * appended after whatever is already in the destination lane. */
export async function moveAllCardsInLane(projectSlug: string, fromLane: string, toLane: string): Promise<number> {
  await ensureSchema();
  const database = requireDatabase();
  const rows = await database.select().from(boardProjectCards).where(and(eq(boardProjectCards.projectSlug, projectSlug))).orderBy(boardProjectCards.lane, boardProjectCards.position);
  const moving = rows.filter((row) => row.lane === fromLane && !row.archived);
  if (!moving.length) return 0;
  let position = rows.filter((row) => row.lane === toLane).reduce((max, row) => Math.max(max, row.position), -1) + 1;
  const now = new Date().toISOString();
  for (const row of moving) {
    await database.update(boardProjectCards).set({ lane: toLane, position, updatedAt: now }).where(and(eq(boardProjectCards.id, row.id), eq(boardProjectCards.projectSlug, projectSlug)));
    position += 1;
  }
  return moving.length;
}

/** Archive (or restore) every card currently in one lane. */
export async function archiveAllCardsInLane(projectSlug: string, lane: string, archived: boolean): Promise<number> {
  await invalidateProjectCounts();
  await ensureSchema();
  const database = requireDatabase();
  const result = await database.update(boardProjectCards).set({ archived, updatedAt: new Date().toISOString() }).where(and(eq(boardProjectCards.projectSlug, projectSlug), eq(boardProjectCards.lane, lane), eq(boardProjectCards.archived, !archived))).returning({ id: boardProjectCards.id });
  return result.length;
}

export async function deleteProjectCard(projectSlug: string, id: string) {
  await invalidateProjectCounts();
  await ensureSchema();
  const database = requireDatabase();
  await database.delete(boardProjectCardTags).where(eq(boardProjectCardTags.cardId, id));
  await database.delete(boardProjectCardWatchers).where(eq(boardProjectCardWatchers.cardId, id));
  await database.delete(boardProjectComments).where(and(eq(boardProjectComments.projectSlug, projectSlug), eq(boardProjectComments.cardId, id)));
  await database.delete(boardProjectCards).where(and(eq(boardProjectCards.id, id), eq(boardProjectCards.projectSlug, projectSlug)));
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
  // Not transactional — see the note on createProjectCard: neon-http cannot
  // run db.transaction() at all, so the revision check below and this update
  // are two separate statements rather than one atomic unit.
  await database.update(boardProjectGraphNodes).set(update).where(and(eq(boardProjectGraphNodes.projectSlug, projectSlug), eq(boardProjectGraphNodes.id, nodeId)));
  return bumpGraphRevision(projectSlug, expectedRevision, database);
}

export async function deleteGraphNode(projectSlug: string, nodeId: string, expectedRevision?: number) {
  await ensureSchema();
  const database = requireDatabase();
  await database.delete(boardProjectGraphEdges).where(and(eq(boardProjectGraphEdges.projectSlug, projectSlug), eq(boardProjectGraphEdges.sourceNodeId, nodeId)));
  await database.delete(boardProjectGraphEdges).where(and(eq(boardProjectGraphEdges.projectSlug, projectSlug), eq(boardProjectGraphEdges.targetNodeId, nodeId)));
  await database.delete(boardProjectGraphNodes).where(and(eq(boardProjectGraphNodes.projectSlug, projectSlug), eq(boardProjectGraphNodes.id, nodeId)));
  return bumpGraphRevision(projectSlug, expectedRevision, database);
}

export async function createGraphEdge(edge: Omit<GraphEdge, 'createdAt' | 'updatedAt'>, expectedRevision?: number) {
  await ensureSchema();
  await ensureProjectGraph(edge.projectSlug);
  if (edge.sourceNodeId === edge.targetNodeId) throw new Error('GRAPH_SELF_EDGE');
  const database = requireDatabase();
  const nodes = await database.select({ id: boardProjectGraphNodes.id }).from(boardProjectGraphNodes).where(and(eq(boardProjectGraphNodes.projectSlug, edge.projectSlug), inArray(boardProjectGraphNodes.id, [edge.sourceNodeId, edge.targetNodeId])));
  if (nodes.length !== 2) throw new Error('GRAPH_NODE_NOT_FOUND');
  await database.insert(boardProjectGraphEdges).values({ ...edge, label: edge.label.trim().slice(0, 120) });
  return bumpGraphRevision(edge.projectSlug, expectedRevision, database);
}

export async function deleteGraphEdge(projectSlug: string, edgeId: string, expectedRevision?: number) {
  await ensureSchema();
  const database = requireDatabase();
  await database.delete(boardProjectGraphEdges).where(and(eq(boardProjectGraphEdges.projectSlug, projectSlug), eq(boardProjectGraphEdges.id, edgeId)));
  return bumpGraphRevision(projectSlug, expectedRevision, database);
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
  await database.update(boardProjectGraphs).set({ settings: JSON.stringify({ snap: clean.snap, gridSize: clean.gridSize, background: clean.background }), updatedAt: new Date().toISOString() }).where(and(eq(boardProjectGraphs.projectSlug, projectSlug), eq(boardProjectGraphs.revision, expectedRevision)));
  return bumpGraphRevision(projectSlug, expectedRevision, database);
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
  // A deleted account's existing session tokens are still signature-valid
  // until their natural 7-day expiry otherwise — revoking here is what
  // actually logs a removed user out, not just blocks their next login.
  await revokeAllSessionsForUser(username);
}

export function overlayTransitions(packets: Packet[], transitions: PersistedTransition[]): Packet[] {
  const byId = new Map(transitions.map((transition) => [transition.packetId, transition]));
  return packets.map((packet) => {
    const transition = byId.get(packet.id);
    if (!transition) return packet;
    return { ...packet, state: transition.nextState, owner: transition.owner || packet.owner, evidence: transition.evidence || packet.evidence, remainder: transition.remainder || packet.remainder };
  });
}

/* --------------------------------------------------------------------------
   Wiki — the fourth per-project surface beside the board, cloud, and graph.

   Pages are markdown files in the project's own cloud (`wiki/**.md` in
   `board_project_files`), not rows in a table only this feature can read. That
   makes the wiki transparent: the same pages are listed, previewed, edited,
   and downloaded from the Cloud view, and a file dropped there by hand simply
   becomes a page. Scoping is strictly per project — the file store is unique
   on `(project_slug, path)` and every call here passes a slug.

   Revisions stay in their own table because a file has no history of its own,
   and a wiki nobody can audit is a wiki nobody corrects.
   ----------------------------------------------------------------------- */

export const WIKI_REVISION_PAGE_SIZE = 25;

function wikiPageFromFile(file: ProjectFile): WikiPage {
  const pageId = pageIdFromPath(file.path) ?? file.path;
  const { meta, body } = parseWikiFile(file.content);
  return {
    id: file.id,
    projectSlug: file.projectSlug,
    pageId,
    path: file.path,
    title: titleFor(pageId, meta, body),
    body,
    pinned: meta.pinned ?? false,
    updatedBy: file.createdBy,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt
  };
}

export async function listWikiPages(projectSlug: string): Promise<WikiPage[]> {
  const files = await listProjectFiles(projectSlug);
  return files
    .filter((file) => pageIdFromPath(file.path) !== null)
    .map(wikiPageFromFile)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title));
}

export async function getWikiPage(projectSlug: string, pageId: string): Promise<WikiPage | null> {
  if (!isValidPageId(pageId)) return null;
  const file = await getProjectFileByPath(projectSlug, wikiPathFor(pageId));
  return file ? wikiPageFromFile(file) : null;
}

/**
 * Writes the page file and appends its revision.
 *
 * These are two statements rather than one transaction because the file write
 * goes through the cloud's own upsert (which the Cloud view and the wiki must
 * share, or the two would drift). The revision is appended after a successful
 * write, so the failure mode is a saved page with one missing history entry —
 * not a history entry for a page that was never saved.
 */
export async function saveWikiPage(input: {
  projectSlug: string;
  pageId: string;
  title: string;
  body: string;
  editor: string;
  summary?: string;
  pinned?: boolean;
}): Promise<WikiPage> {
  if (!isValidPageId(input.pageId)) throw new Error('INVALID_PAGE_ID');
  await ensureSchema();
  const path = wikiPathFor(input.pageId);
  const existing = await getProjectFileByPath(input.projectSlug, path);
  const content = serializeWikiFile({ title: input.title, pinned: input.pinned, body: input.body });
  const file = await upsertProjectFile({
    id: existing?.id ?? `wiki-${input.projectSlug}-${input.pageId.replace(/\//g, '-')}`,
    projectSlug: input.projectSlug,
    path,
    content,
    mimeType: 'text/markdown',
    createdBy: input.editor
  });
  await requireDatabase().insert(boardProjectWikiRevisions).values({
    pageId: path,
    projectSlug: input.projectSlug,
    title: input.title,
    body: input.body,
    editedBy: input.editor,
    summary: (input.summary ?? '').slice(0, 200)
  });
  return wikiPageFromFile(file);
}

/** Deleting a page removes its file; the revisions outlive it. */
export async function deleteWikiPage(projectSlug: string, pageId: string): Promise<void> {
  const file = await getProjectFileByPath(projectSlug, wikiPathFor(pageId));
  if (!file) return;
  await deleteProjectFile(projectSlug, file.id);
}

export async function listWikiRevisions(path: string, limit = WIKI_REVISION_PAGE_SIZE): Promise<WikiRevision[]> {
  if (!databaseConfigured()) return [];
  await ensureSchema();
  const rows = await requireDatabase()
    .select()
    .from(boardProjectWikiRevisions)
    .where(eq(boardProjectWikiRevisions.pageId, path))
    .orderBy(desc(boardProjectWikiRevisions.createdAt), desc(boardProjectWikiRevisions.id))
    .limit(limit);
  return rows.map((row) => ({
    id: String(row.id),
    pageId: row.pageId,
    title: row.title,
    body: row.body,
    editedBy: row.editedBy,
    summary: row.summary,
    createdAt: row.createdAt
  }));
}
