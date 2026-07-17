import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Redis from 'ioredis';
import { WriteRedisAdapter as RedisAdapter } from '../src/storage/redis-adapter';

const TEST_PREFIX = 'zuweila-test:';
const redis = new Redis(process.env.ZUWEILA_REDIS_URL ?? 'redis://localhost:6379');
const adapter = new RedisAdapter(redis, TEST_PREFIX);

async function flushTestKeys(): Promise<void> {
  const keys = await redis.keys(`${TEST_PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
}

beforeEach(async () => {
  await flushTestKeys();
});

afterAll(async () => {
  await flushTestKeys();
  await adapter.disconnect();
});

describe('flagExists', () => {
  it('returns false for a flag that does not exist', async () => {
    expect(await adapter.flagExists('nonexistent')).toBe(false);
  });

  it('returns true after creating a flag', async () => {
    await adapter.createFlag('my-flag', 'desc', true);
    expect(await adapter.flagExists('my-flag')).toBe(true);
  });
});

describe('createFlag / getFlag', () => {
  it('stores all fields correctly', async () => {
    await adapter.createFlag('beta', 'Beta feature', true);
    const flag = await adapter.getFlag('beta');
    expect(flag).not.toBeNull();
    expect(flag!.key).toBe('beta');
    expect(flag!.enabled).toBe(true);
    expect(flag!.rollout_pct).toBe(0);
    expect(flag!.description).toBe('Beta feature');
    expect(flag!.created_at).toBeTruthy();
    expect(flag!.updated_at).toBeTruthy();
  });

  it('getFlag returns null for missing flag', async () => {
    expect(await adapter.getFlag('ghost')).toBeNull();
  });
});

describe('listFlags', () => {
  it('returns empty array when no flags exist', async () => {
    expect(await adapter.listFlags()).toEqual([]);
  });

  it('returns all created flags', async () => {
    await adapter.createFlag('flag-a', '', true);
    await adapter.createFlag('flag-b', '', false);
    const flags = await adapter.listFlags();
    const keys = flags.map((f) => f.key).sort();
    expect(keys).toEqual(['flag-a', 'flag-b']);
  });
});

describe('setEnabled', () => {
  it('toggles enabled state', async () => {
    await adapter.createFlag('toggle-me', '', true);
    await adapter.setEnabled('toggle-me', false);
    expect((await adapter.getFlag('toggle-me'))!.enabled).toBe(false);
    await adapter.setEnabled('toggle-me', true);
    expect((await adapter.getFlag('toggle-me'))!.enabled).toBe(true);
  });
});

describe('deleteFlag', () => {
  it('removes the flag from the index and hash', async () => {
    await adapter.createFlag('to-delete', '', true);
    await adapter.deleteFlag('to-delete');
    expect(await adapter.flagExists('to-delete')).toBe(false);
    expect(await adapter.getFlag('to-delete')).toBeNull();
  });
});

describe('getOverrides', () => {
  it('returns empty object when no overrides exist', async () => {
    await adapter.createFlag('no-overrides', '', true);
    expect(await adapter.getOverrides('no-overrides')).toEqual({});
  });
});

describe('appendAuditEvent', () => {
  it('writes an audit entry to the events list', async () => {
    await adapter.createFlag('audited', '', true);
    await adapter.appendAuditEvent('audited', 'created');
    const raw = await redis.lrange(`${TEST_PREFIX}events:audited`, 0, -1);
    expect(raw.length).toBe(1);
    const entry = JSON.parse(raw[0]);
    expect(entry.type).toBe('created');
    expect(entry.timestamp).toBeTruthy();
  });
});

describe('publish', () => {
  it('publishes without throwing', async () => {
    await expect(
      adapter.publish({ flagKey: 'some-flag', type: 'created', timestamp: new Date().toISOString() }),
    ).resolves.not.toThrow();
  });
});

describe('custom prefix', () => {
  it('stores keys under the custom prefix, not the default', async () => {
    const customAdapter = new RedisAdapter(redis, 'myapp-flags:');
    await customAdapter.createFlag('custom-flag', '', true);

    const customKeys = await redis.keys('myapp-flags:*');
    const defaultFlagExists = await redis.exists('zuweila:flags:custom-flag');

    expect(customKeys.length).toBeGreaterThan(0);
    expect(defaultFlagExists).toBe(0);

    await redis.del(...customKeys);
  });
});
