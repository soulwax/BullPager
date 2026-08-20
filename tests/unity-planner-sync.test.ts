import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Packet } from '$lib/types';
import { slugifyTag } from '$lib/projectTags';

/**
 * WARD-04 — proves `syncUnityPlannerCards` against the REAL configured
 * database rather than a mock, because the property under test — "board-owned
 * fields survive a re-sync", "a repeat sync writes nothing", "a mid-pass
 * failure leaves no digest" — is a property of the actual upsert/merge SQL,
 * not of anything a hand-rolled fake query builder would faithfully
 * reproduce.
 *
 * Every row this file creates lives under one throwaway `projectSlug` unique
 * to the run (`_test-ward04-sync-<uuid>`), which `syncUnityPlannerCards`
 * accepts via `options.projectSlug` specifically so this suite can exist
 * without ever touching the real `unity-plan` board. `afterAll` deletes every
 * table this slug could have written to.
 *
 * Skipped entirely when no database is configured (contributor machines
 * without `.env`, or CI without the secret) — the same gate
 * `syncUnityPlannerCards` itself uses.
 */

const persistence = await import('../src/lib/server/persistence');
const { syncUnityPlannerCards } = persistence;

const dbModule = await import('../src/lib/server/db');
const { db, databaseConfigured } = dbModule;

const {
  boardProjectCards,
  boardProjectCardTags,
  boardProjectCardWatchers,
  boardProjectComments,
  boardProjectActivity,
  boardSettings,
  boardProjects
} = await import('../src/lib/server/db/schema');

const suite = databaseConfigured() ? describe : describe.skip;

suite('syncUnityPlannerCards (real database)', () => {
  const slug = `_test-ward04-sync-${randomUUID().slice(0, 8)}`;

  function packet(overrides: Partial<Packet> = {}): Packet {
    return {
      id: 'WARD-04',
      title: 'Synchronize the plan with the project database',
      state: 'OPEN',
      owner: 'soulwax',
      category: 'Persistence and database synchronization',
      subcategory: 'Planner cards and activity',
      tags: ['database', 'sync'],
      handles: ['u0-sync-projection-rule', 'u0-sync-upsert-adapter'],
      runbook: '1. Parse. 2. Upsert. 3. Repeat and record.',
      dependsOn: ['WARD-00'],
      milestone: 'U0',
      outcome: 'Every valid implementation packet has an idempotent card.',
      inputs: 'syncUnityPlannerCards, DATABASE_URL, packet parser.',
      files: 'website persistence/tests and database-sync documentation.',
      doNotTouch: 'gameplay save files, user-owned board lane positions.',
      checks: 'Two identical syncs produce no changes.',
      evidence: 'none',
      remainder: 'none',
      steps: '1. `u0-sync-projection-rule` — parse.\n2. `u0-sync-upsert-adapter` — upsert.',
      ...overrides
    };
  }

  // Mirrors the id-generation fix in syncUnityPlannerCards: only the real
  // 'unity-plan' project keeps the bare `unity-ward-XX` format; every other
  // slug (this test's included) gets one disambiguated by the slug, so a
  // test card can never collide with — or silently no-op against — the real
  // production card of the same packet id.
  const cardId = (packetId = 'WARD-04') => `unity-${slugifyTag(slug)}-${packetId.toLowerCase()}`;

  async function cleanup() {
    const database = db!;
    await database.delete(boardProjectComments).where(eq(boardProjectComments.projectSlug, slug));
    await database.delete(boardProjectActivity).where(eq(boardProjectActivity.projectSlug, slug));
    await database.delete(boardProjectCardWatchers).where(eq(boardProjectCardWatchers.cardId, cardId()));
    await database.delete(boardProjectCardTags).where(eq(boardProjectCardTags.cardId, cardId()));
    await database.delete(boardProjectCards).where(eq(boardProjectCards.projectSlug, slug));
    // boardSettings keys are global, scoped only by the slug embedded in the key.
    const settingsRows = await database.select({ key: boardSettings.key }).from(boardSettings);
    const ours = settingsRows.filter((row) => row.key.includes(slug));
    for (const row of ours) {
      await database.delete(boardSettings).where(eq(boardSettings.key, row.key));
    }
    await database.delete(boardProjects).where(eq(boardProjects.slug, slug));
  }

  beforeAll(cleanup);
  afterAll(cleanup);

  it('u0-sync-upsert-adapter: creates a card carrying only source-owned fields', async () => {
    const changed = await syncUnityPlannerCards([packet()], { sourceDigest: 'digest-1', projectSlug: slug });
    expect(changed).toBe(1);

    const rows = await db!.select().from(boardProjectCards).where(and(eq(boardProjectCards.id, cardId()), eq(boardProjectCards.projectSlug, slug)));
    expect(rows).toHaveLength(1);
    const card = rows[0];
    expect(card.title).toBe('WARD-04 · Synchronize the plan with the project database');
    expect(card.owner).toBe('soulwax');
    // Board-owned fields get their FIRST value from sync (a brand-new card has
    // to start somewhere), but are never touched again after this — proven below.
    expect(card.lane).toBe('Backlog');
    expect(card.archived).toBe(false);
  });

  it('u0-sync-noop-test: an unchanged plan writes nothing on repeat', async () => {
    const activityBefore = await db!.select().from(boardProjectActivity).where(eq(boardProjectActivity.projectSlug, slug));

    const changed = await syncUnityPlannerCards([packet()], { sourceDigest: 'digest-1', projectSlug: slug });

    expect(changed).toBe(0);
    const activityAfter = await db!.select().from(boardProjectActivity).where(eq(boardProjectActivity.projectSlug, slug));
    // The digest-shortcut skips the whole pass, so it must not even reach the
    // point of deciding "nothing changed" per card — no activity, no query.
    expect(activityAfter).toHaveLength(activityBefore.length);
  });

  it('u0-sync-board-owned-guard + u0-sync-conflict-test: a dragged lane, a comment, and a custom tag all survive a changed source packet', async () => {
    // Move the card, comment on it, and tag it — exactly what a human does on
    // a real board between two plan edits.
    await db!.update(boardProjectCards).set({ lane: 'In progress', position: 3, archived: true }).where(and(eq(boardProjectCards.id, cardId()), eq(boardProjectCards.projectSlug, slug)));
    await db!.insert(boardProjectComments).values({ projectSlug: slug, cardId: cardId(), author: 'reviewer', body: 'Looks right, holding here.' });
    const customTagId = `${slug}-tag-custom-mine`;
    await db!.insert(boardProjectCardTags).values({ cardId: cardId(), tagId: customTagId });
    await db!.insert(boardProjectCardWatchers).values({ cardId: cardId(), username: 'reviewer' });

    // Now the source text genuinely changes — a new title and a new state.
    const changed = await syncUnityPlannerCards(
      [packet({ title: 'Synchronize the plan with the project database (revised)', state: 'CLOSED' })],
      { sourceDigest: 'digest-2', projectSlug: slug }
    );

    expect(changed).toBe(1);
    const rows = await db!.select().from(boardProjectCards).where(and(eq(boardProjectCards.id, cardId()), eq(boardProjectCards.projectSlug, slug)));
    const card = rows[0];

    // Source-owned: updated.
    expect(card.title).toContain('(revised)');

    // Board-owned: untouched by the sync that just ran.
    expect(card.lane).toBe('In progress');
    expect(card.position).toBe(3);
    expect(card.archived).toBe(true);

    const comments = await db!.select().from(boardProjectComments).where(eq(boardProjectComments.cardId, cardId()));
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe('Looks right, holding here.');

    const watchers = await db!.select().from(boardProjectCardWatchers).where(eq(boardProjectCardWatchers.cardId, cardId()));
    expect(watchers.map((w) => w.username)).toEqual(['reviewer']);

    const tags = await db!.select().from(boardProjectCardTags).where(eq(boardProjectCardTags.cardId, cardId()));
    expect(tags.map((t) => t.tagId)).toContain(customTagId);
  });

  it('u0-sync-tag-namespace-rule: plan-derived tags live under a reserved plan- namespace distinct from the custom tag', async () => {
    const tags = await db!.select().from(boardProjectCardTags).where(eq(boardProjectCardTags.cardId, cardId()));
    const tagIds = tags.map((t) => t.tagId);
    const planTags = tagIds.filter((id) => id.includes('-tag-plan-'));
    const customTags = tagIds.filter((id) => !id.includes('-tag-plan-') && !id.endsWith('-tag-content') && !id.endsWith('-tag-blocked') && !id.endsWith('-tag-priority'));

    // The packet declares tags: ['database', 'sync'] — both must have landed
    // under the plan- namespace, never as bare `database`/`sync` tag ids that
    // could collide with a user-authored tag of the same name.
    expect(planTags.some((id) => id.includes('plan-database'))).toBe(true);
    expect(planTags.some((id) => id.includes('plan-sync'))).toBe(true);
    // And the custom tag from the previous test is still there, unrenamed.
    expect(customTags).toContain(`${slug}-tag-custom-mine`);
  });

  it('u0-sync-checklist-merge-rule: a ticked handle survives when unrelated steps text changes', async () => {
    const before = await db!.select({ checklist: boardProjectCards.checklist }).from(boardProjectCards).where(and(eq(boardProjectCards.id, cardId()), eq(boardProjectCards.projectSlug, slug)));
    const items: Array<{ id: string; text: string; done: boolean }> = JSON.parse(before[0].checklist);
    expect(items.length).toBeGreaterThan(0);

    // A human ticks the first handle's checklist item directly on the board.
    const tickedId = items[0].id;
    const ticked = items.map((item) => (item.id === tickedId ? { ...item, done: true } : item));
    await db!.update(boardProjectCards).set({ checklist: JSON.stringify(ticked) }).where(and(eq(boardProjectCards.id, cardId()), eq(boardProjectCards.projectSlug, slug)));

    // The source changes the RUNBOOK text (unrelated to the handle list) and
    // re-syncs. The handle set and order are unchanged.
    const changed = await syncUnityPlannerCards(
      [packet({
        title: 'Synchronize the plan with the project database (revised)',
        state: 'CLOSED',
        runbook: '1. Parse differently now. 2. Upsert. 3. Repeat and record.'
      })],
      { sourceDigest: 'digest-3', projectSlug: slug }
    );

    expect(changed).toBe(1);
    const after = await db!.select({ checklist: boardProjectCards.checklist }).from(boardProjectCards).where(and(eq(boardProjectCards.id, cardId()), eq(boardProjectCards.projectSlug, slug)));
    const afterItems: Array<{ id: string; text: string; done: boolean }> = JSON.parse(after[0].checklist);
    const stillTicked = afterItems.find((item) => item.id === tickedId);
    expect(stillTicked?.done).toBe(true);
  });

  it('u0-sync-retry-test: a failure mid-pass leaves no digest, so the next run is a full retry', async () => {
    // A second packet in the same pass, so there is a "before the failure" and
    // an "after the failure" card to distinguish.
    const packets = [
      packet({ id: 'WARD-04', title: 'First card in the pass' }),
      packet({ id: 'WARD-05', title: 'Second card in the pass — never reached' })
    ];

    // Wrap the real drizzle instance so its FIRST `.insert(...)` call this
    // pass succeeds (creating WARD-05's fresh card row) and its SECOND throws
    // — landing the failure between the two packets' writes, which is exactly
    // "mid-pass": genuine SQL executes against the real database right up to
    // the injected fault, rather than a fully faked client that would only
    // prove the fake's own behaviour.
    const realDb = db!;
    let insertCalls = 0;
    const faultyDb = new Proxy(realDb, {
      get(target, prop, receiver) {
        if (prop === 'insert') {
          return (...args: Parameters<typeof realDb.insert>) => {
            insertCalls += 1;
            if (insertCalls > 1) {
              throw new Error('injected transient failure (WARD-04 u0-sync-retry-test)');
            }
            return Reflect.get(target, prop, receiver).apply(target, args);
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    vi.doMock('../src/lib/server/db', async (importOriginal) => {
      const actual = await importOriginal<typeof dbModule>();
      return { ...actual, db: faultyDb };
    });
    vi.resetModules();
    const faultyPersistence = await import('../src/lib/server/persistence');

    await expect(
      faultyPersistence.syncUnityPlannerCards(packets, { sourceDigest: 'digest-retry-attempt-1', projectSlug: slug })
    ).rejects.toThrow(/injected transient failure/);

    vi.doUnmock('../src/lib/server/db');
    vi.resetModules();

    // The digest for this failed attempt must not have been recorded.
    const digestRows = await db!.select().from(boardSettings).where(eq(boardSettings.key, `project_${slug}_planner_digest`));
    expect(digestRows[0]?.value ?? '').not.toBe('digest-retry-attempt-1');

    // The retry, with a real (unwrapped) database, completes and DOES record it.
    const retryPersistence = await import('../src/lib/server/persistence');
    const changed = await retryPersistence.syncUnityPlannerCards(packets, { sourceDigest: 'digest-retry-attempt-1', projectSlug: slug });
    expect(changed).toBeGreaterThan(0);
    const digestAfterRetry = await db!.select().from(boardSettings).where(eq(boardSettings.key, `project_${slug}_planner_digest`));
    expect(digestAfterRetry[0]?.value).toBe('digest-retry-attempt-1');

    // Clean up WARD-05's card, which only this test creates.
    await db!.delete(boardProjectCardTags).where(eq(boardProjectCardTags.cardId, cardId('WARD-05')));
    await db!.delete(boardProjectCards).where(and(eq(boardProjectCards.projectSlug, slug), eq(boardProjectCards.id, cardId('WARD-05'))));
  });
});
