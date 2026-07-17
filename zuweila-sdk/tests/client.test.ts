import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import Redis from 'ioredis';
import { ZuweilaClient } from '../src/client';

const REDIS_URL = process.env.ZUWEILA_REDIS_URL ?? 'redis://localhost:6379';
const PREFIX = 'sdk-test:';

const redis = new Redis(REDIS_URL);

function key(name: string): string {
  return `${PREFIX}${name}`;
}

async function flushTestKeys(): Promise<void> {
  const keys = await redis.keys(`${PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
}

async function seedFlag(
  flagKey: string,
  opts: { enabled?: boolean; rollout?: number } = {},
): Promise<void> {
  const { enabled = true, rollout = 0 } = opts;
  const now = new Date().toISOString();
  await redis.hset(key(`flags:${flagKey}`), {
    key: flagKey,
    enabled: enabled ? 'true' : 'false',
    rollout_pct: String(rollout),
    description: '',
    created_at: now,
    updated_at: now,
  });
  await redis.sadd(key('flag_keys'), flagKey);
}

async function seedOverride(flagKey: string, contextKey: string, value: boolean): Promise<void> {
  await redis.hset(key(`overrides:${flagKey}`), contextKey, value ? 'true' : 'false');
}

async function publishChange(flagKey: string, type: string): Promise<void> {
  await redis.publish(key('changes'), JSON.stringify({ flagKey, type, timestamp: new Date().toISOString() }));
}

beforeEach(async () => {
  await flushTestKeys();
  ZuweilaClient._resetInstance();
});

afterAll(async () => {
  await flushTestKeys();
  redis.disconnect();
});

describe('URL constructor', () => {
  it('connect() loads all flags and overrides into cache', async () => {
    await seedFlag('feat-a', { enabled: true });
    await seedFlag('feat-b', { enabled: false });
    await seedOverride('feat-a', 'user-1', false);

    const client = new (ZuweilaClient as any)({ redis: REDIS_URL, prefix: PREFIX });
    await client.connect();

    expect(client.isEnabled('feat-a', 'user-1')).toBe(false);
    expect(client.isEnabled('feat-b')).toBe(false);

    await client.disconnect();
  });
});

describe('existing-client constructor', () => {
  it('connect() works; SDK does not disconnect the caller client', async () => {
    await seedFlag('feat-c', { enabled: true, rollout: 100 });

    const sharedRedis = new Redis(REDIS_URL);
    const client = new (ZuweilaClient as any)({ client: sharedRedis, prefix: PREFIX });
    await client.connect();

    expect(client.isEnabled('feat-c')).toBe(true);

    await client.disconnect();
    expect(await sharedRedis.ping()).toBe('PONG');
    sharedRedis.disconnect();
  });
});

describe('isEnabled', () => {
  it('returns correct result for enabled / disabled / rollout=100 flags', async () => {
    await seedFlag('on', { enabled: true, rollout: 100 });
    await seedFlag('off', { enabled: false, rollout: 100 });
    await seedFlag('full-rollout', { enabled: true, rollout: 100 });

    const client = new (ZuweilaClient as any)({ redis: REDIS_URL, prefix: PREFIX });
    await client.connect();

    expect(client.isEnabled('on')).toBe(true);
    expect(client.isEnabled('off')).toBe(false);
    expect(client.isEnabled('full-rollout', 'any-user')).toBe(true);

    await client.disconnect();
  });

  it('unknown_flag: returns false, emits event, calls onMetric', async () => {
    const metrics: string[] = [];
    const client = new (ZuweilaClient as any)({
      redis: REDIS_URL,
      prefix: PREFIX,
      onMetric: (name: string) => metrics.push(name),
    });
    await client.connect();

    const events: string[] = [];
    client.on('unknown_flag', (k: string) => events.push(k));

    expect(client.isEnabled('no-such-flag')).toBe(false);
    expect(events).toContain('no-such-flag');
    expect(metrics).toContain('unknown_flag');

    await client.disconnect();
  });

  it('missing_context_key: returns false, emits event, calls onMetric', async () => {
    await seedFlag('partial', { enabled: true, rollout: 50 });

    const metrics: string[] = [];
    const client = new (ZuweilaClient as any)({
      redis: REDIS_URL,
      prefix: PREFIX,
      onMetric: (name: string) => metrics.push(name),
    });
    await client.connect();

    const events: string[] = [];
    client.on('missing_context_key', (k: string) => events.push(k));

    expect(client.isEnabled('partial')).toBe(false);
    expect(events).toContain('partial');
    expect(metrics).toContain('missing_context_key');

    await client.disconnect();
  });
});

describe('pub/sub cache patching', () => {
  it('flag change patches single cache entry without reloading all flags', async () => {
    await seedFlag('live', { enabled: true, rollout: 100 });

    const client = new (ZuweilaClient as any)({ redis: REDIS_URL, prefix: PREFIX });
    await client.connect();
    expect(client.isEnabled('live')).toBe(true);

    await redis.hset(key('flags:live'), 'enabled', 'false');
    await publishChange('live', 'disabled');

    await new Promise(r => setTimeout(r, 80));
    expect(client.isEnabled('live')).toBe(false);

    await client.disconnect();
  });

  it('override change patches only that flag\'s override cache', async () => {
    await seedFlag('overridable', { enabled: true, rollout: 100 });

    const client = new (ZuweilaClient as any)({ redis: REDIS_URL, prefix: PREFIX });
    await client.connect();
    expect(client.isEnabled('overridable', 'alice')).toBe(true);

    await seedOverride('overridable', 'alice', false);
    await publishChange('overridable', 'override_set');

    await new Promise(r => setTimeout(r, 80));
    expect(client.isEnabled('overridable', 'alice')).toBe(false);

    await client.disconnect();
  });
});

describe('onDisconnect modes', () => {
  it('fail-closed (default): returns false before connect()', () => {
    const client = new (ZuweilaClient as any)({ redis: REDIS_URL, prefix: PREFIX });
    expect(client.isEnabled('any-flag')).toBe(false);
  });

  it('fail-open: returns true before connect()', () => {
    const client = new (ZuweilaClient as any)({
      redis: REDIS_URL,
      prefix: PREFIX,
      onDisconnect: 'fail-open',
    });
    expect(client.isEnabled('any-flag')).toBe(true);
  });

  it('last-known-cache: serves cached values after disconnect signal', async () => {
    await seedFlag('cached', { enabled: true, rollout: 100 });

    const client = new (ZuweilaClient as any)({
      redis: REDIS_URL,
      prefix: PREFIX,
      onDisconnect: 'last-known-cache',
    });
    await client.connect();
    expect(client.isEnabled('cached')).toBe(true);

    client.isDisconnected = true;
    expect(client.isEnabled('cached')).toBe(true);

    await client.disconnect();
  });

  it('last-known-cache + never connected: falls back to false', () => {
    const client = new (ZuweilaClient as any)({
      redis: REDIS_URL,
      prefix: PREFIX,
      onDisconnect: 'last-known-cache',
    });
    expect(client.isEnabled('anything')).toBe(false);
  });
});

describe('getInstance', () => {
  it('returns the same instance on repeated calls', () => {
    const a = ZuweilaClient.getInstance({ redis: REDIS_URL, prefix: PREFIX });
    const b = ZuweilaClient.getInstance();
    expect(a).toBe(b);
    a.disconnect().catch(() => {});
  });

  it('throws a clear error when called without options before first instantiation', () => {
    expect(() => ZuweilaClient.getInstance()).toThrow(
      'ZuweilaClient.getInstance() requires options on first call.',
    );
  });
});

describe('custom prefix', () => {
  it('custom prefix isolates keys from a different prefix', async () => {
    await redis.hset('other:flags:iso-flag', {
      key: 'iso-flag', enabled: 'true', rollout_pct: '0',
      description: '', created_at: '', updated_at: '',
    });
    await redis.sadd('other:flag_keys', 'iso-flag');

    const client = new (ZuweilaClient as any)({ redis: REDIS_URL, prefix: PREFIX });
    await client.connect();

    expect(client.isEnabled('iso-flag')).toBe(false);

    await client.disconnect();
    await redis.del('other:flag_keys', 'other:flags:iso-flag');
  });
});
