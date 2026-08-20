import { env } from '$env/dynamic/private';
import { Redis } from '@upstash/redis';

/**
 * Read-through cache on Upstash Redis (Vercel Marketplace).
 *
 * Two properties matter more than hit rate here:
 *
 * 1. **A cache failure is never a page failure.** Every operation is wrapped
 *    so a timeout, a bad token, or a full instance degrades to "miss" and the
 *    caller recomputes from Postgres. A board that renders slowly is a
 *    nuisance; a board that 500s because a cache blinked is an outage.
 * 2. **Absent is a valid state.** Without credentials this no-ops, exactly the
 *    way `databaseConfigured()` already lets the app run without Postgres.
 *    That is not a stand-in for the real thing — it is what a *cache* is
 *    supposed to do when it isn't there.
 *
 * Env: the Marketplace provisions Upstash under `KV_REST_API_URL` /
 * `KV_REST_API_TOKEN`; a hand-configured Upstash account uses the
 * `UPSTASH_REDIS_REST_*` names. Both are accepted so neither path needs a
 * code change.
 */

/** Bump to invalidate every key at once when a cached shape changes. */
const NAMESPACE = 'cirrus:v1';

/** A slow cache is worse than no cache: give up and read the source instead. */
const TIMEOUT_MS = 1200;

type CacheStats = { hits: number; misses: number; errors: number; skipped: number };
const stats: CacheStats = { hits: 0, misses: 0, errors: 0, skipped: 0 };

let client: Redis | null = null;
let resolved = false;

function credentials(): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function cacheConfigured(): boolean {
  return credentials() !== null;
}

function redis(): Redis | null {
  if (resolved) return client;
  resolved = true;
  const creds = credentials();
  if (!creds) return (client = null);
  try {
    client = new Redis({ url: creds.url, token: creds.token });
  } catch (error) {
    console.error('[cache] could not construct the Redis client', error);
    client = null;
  }
  return client;
}

/** Runs an operation under a deadline; any failure resolves to `fallback`. */
async function guarded<T>(label: string, operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS))
    ]);
  } catch (error) {
    stats.errors += 1;
    console.error(`[cache] ${label} failed; continuing without it`, error);
    return fallback;
  }
}

const namespaced = (key: string) => `${NAMESPACE}:${key}`;

export async function cacheGet<T>(key: string): Promise<T | null> {
  const store = redis();
  if (!store) { stats.skipped += 1; return null; }
  const value = await guarded<T | null>('get', () => store.get<T>(namespaced(key)), null);
  if (value === null || value === undefined) { stats.misses += 1; return null; }
  stats.hits += 1;
  return value;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const store = redis();
  if (!store) return;
  await guarded('set', () => store.set(namespaced(key), value, { ex: Math.max(1, Math.round(ttlSeconds)) }), undefined);
}

export async function cacheDelete(...keys: string[]): Promise<void> {
  const store = redis();
  if (!store || !keys.length) return;
  await guarded('del', () => store.del(...keys.map(namespaced)), 0);
}

/**
 * Read-through: return the cached value, or produce it and store it.
 *
 * `produce` runs outside the guard on purpose — a failure to *compute* is a
 * real error the caller should see, unlike a failure to cache.
 */
export async function cached<T>(key: string, ttlSeconds: number, produce: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await produce();
  // Caching `null`/`undefined` would be indistinguishable from a miss on the
  // next read, so those simply go uncached rather than being stored as a
  // sentinel nobody would remember to decode.
  if (value !== null && value !== undefined) await cacheSet(key, value, ttlSeconds);
  return value;
}

/** Snapshot for diagnostics. Counters are per server instance, not global. */
export function cacheStats(): CacheStats & { configured: boolean } {
  return { ...stats, configured: cacheConfigured() };
}

/** Test seam: forget the memoised client so credentials can change. */
export function resetCacheClient(): void {
  client = null;
  resolved = false;
}
