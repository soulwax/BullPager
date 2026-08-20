import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The cache's contract is mostly about what it refuses to do: it must never
 * turn its own failure into the caller's failure, and it must be a no-op
 * rather than an error when it isn't provisioned at all.
 */

const dynamicEnv = vi.hoisted(() => ({ env: {} as Record<string, string> }));
const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  ctor: vi.fn()
}));

vi.mock('$env/dynamic/private', () => dynamicEnv);
vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(config: unknown) { redisMock.ctor(config); }
    get = redisMock.get;
    set = redisMock.set;
    del = redisMock.del;
  }
}));

const cache = await import('../src/lib/server/cache');

const withCredentials = () => {
  dynamicEnv.env = { KV_REST_API_URL: 'https://example.upstash.io', KV_REST_API_TOKEN: 'token' };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  dynamicEnv.env = {};
  cache.resetCacheClient();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('when no credentials are configured', () => {
  it('reports itself unconfigured and never constructs a client', async () => {
    expect(cache.cacheConfigured()).toBe(false);
    await cache.cacheGet('anything');
    expect(redisMock.ctor).not.toHaveBeenCalled();
  });

  it('still returns the produced value, uncached', async () => {
    const produce = vi.fn(async () => 'computed');
    expect(await cache.cached('k', 60, produce)).toBe('computed');
    expect(produce).toHaveBeenCalledTimes(1);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('treats writes and deletes as no-ops rather than errors', async () => {
    await expect(cache.cacheSet('k', 1, 60)).resolves.toBeUndefined();
    await expect(cache.cacheDelete('k')).resolves.toBeUndefined();
  });
});

describe('credential discovery', () => {
  it('accepts the Marketplace KV_ names', () => {
    withCredentials();
    expect(cache.cacheConfigured()).toBe(true);
  });

  it('accepts the hand-configured UPSTASH_ names too', () => {
    dynamicEnv.env = { UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'token' };
    expect(cache.cacheConfigured()).toBe(true);
  });

  it('needs both halves — a url with no token is not configured', () => {
    dynamicEnv.env = { KV_REST_API_URL: 'https://example.upstash.io' };
    expect(cache.cacheConfigured()).toBe(false);
  });
});

describe('read-through behaviour', () => {
  beforeEach(withCredentials);

  it('returns the cached value without producing', async () => {
    redisMock.get.mockResolvedValue({ value: 'from-cache' });
    const produce = vi.fn();
    expect(await cache.cached('k', 60, produce)).toEqual({ value: 'from-cache' });
    expect(produce).not.toHaveBeenCalled();
  });

  it('produces and stores on a miss', async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue('OK');
    expect(await cache.cached('k', 45, async () => 'fresh')).toBe('fresh');
    expect(redisMock.set).toHaveBeenCalledWith(expect.stringContaining('k'), 'fresh', { ex: 45 });
  });

  it('namespaces every key so one bump invalidates the whole shape', async () => {
    redisMock.get.mockResolvedValue(null);
    await cache.cacheGet('plan:packets:abc');
    expect(redisMock.get).toHaveBeenCalledWith(expect.stringMatching(/^cirrus:v\d+:plan:packets:abc$/));
  });

  it('does not store null, which would be indistinguishable from a miss', async () => {
    redisMock.get.mockResolvedValue(null);
    expect(await cache.cached('k', 60, async () => null)).toBeNull();
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

describe('failure is never the caller’s problem', () => {
  beforeEach(withCredentials);

  it('falls back to producing when the read throws', async () => {
    redisMock.get.mockRejectedValue(new Error('connection reset'));
    expect(await cache.cached('k', 60, async () => 'recomputed')).toBe('recomputed');
  });

  it('still returns the value when the write throws', async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockRejectedValue(new Error('quota exceeded'));
    await expect(cache.cached('k', 60, async () => 'value')).resolves.toBe('value');
  });

  it('swallows a delete failure', async () => {
    redisMock.del.mockRejectedValue(new Error('gone'));
    await expect(cache.cacheDelete('k')).resolves.toBeUndefined();
  });

  it('gives up on a hanging read rather than holding the request open', async () => {
    vi.useFakeTimers();
    redisMock.get.mockImplementation(() => new Promise(() => {}));
    const pending = cache.cached('k', 60, async () => 'produced-instead');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBe('produced-instead');
  });

  it('propagates a failure to *produce*, which is a real error', async () => {
    redisMock.get.mockResolvedValue(null);
    await expect(cache.cached('k', 60, async () => { throw new Error('postgres down'); })).rejects.toThrow('postgres down');
  });
});
