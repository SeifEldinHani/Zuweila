import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { ZuweilaClient } from '../src/client';

const REDIS_URL = process.env.ZUWEILA_REDIS_URL ?? 'redis://localhost:6379';
const PREFIX = 'acl-test:';
const ACL_USER = 'zuweila-reader-test';
const ACL_PASSWORD = 'test-reader-password';

const admin = new Redis(REDIS_URL);

function key(name: string): string {
  return `${PREFIX}${name}`;
}

async function seedFlag(flagKey: string, opts: { enabled?: boolean; rollout?: number } = {}): Promise<void> {
  const { enabled = true, rollout = 0 } = opts;
  const now = new Date().toISOString();
  await admin.hset(key(`flags:${flagKey}`), {
    key: flagKey,
    enabled: enabled ? 'true' : 'false',
    rollout_pct: String(rollout),
    description: '',
    created_at: now,
    updated_at: now,
  });
  await admin.sadd(key('flag_keys'), flagKey);
}

async function seedOverride(flagKey: string, contextKey: string, value: boolean): Promise<void> {
  await admin.hset(key(`overrides:${flagKey}`), contextKey, value ? 'true' : 'false');
}

async function flushTestKeys(): Promise<void> {
  const keys = await admin.keys(`${PREFIX}*`);
  if (keys.length > 0) await admin.del(...keys);
}

beforeAll(async () => {
  await admin.call(
    'ACL', 'SETUSER', ACL_USER, 'on', `>${ACL_PASSWORD}`,
    `~${PREFIX}*`,
    `&${PREFIX}*`,
    '-@all',
    '+hgetall', '+smembers', '+subscribe', '+psubscribe',
  );

  await seedFlag('enabled-flag', { enabled: true, rollout: 100 });
  await seedFlag('disabled-flag', { enabled: false, rollout: 100 });
  await seedFlag('rollout-flag', { enabled: true, rollout: 50 });
  await seedOverride('rollout-flag', 'forced-user', true);
});

afterAll(async () => {
  await flushTestKeys();
  await admin.call('ACL', 'DELUSER', ACL_USER);
  admin.disconnect();
});

describe('SDK under zuweila-reader ACL', () => {
  it('connects and loads flag cache under read-only permissions', async () => {
    const readerUrl = `redis://${ACL_USER}:${ACL_PASSWORD}@127.0.0.1:6379`;
    const client = new (ZuweilaClient as any)({ redis: readerUrl, prefix: PREFIX });
    await client.connect();

    expect(client.isEnabled('enabled-flag')).toBe(true);
    expect(client.isEnabled('disabled-flag')).toBe(false);

    await client.disconnect();
  });

  it('evaluates a 100% rollout flag correctly under ACL', async () => {
    const readerUrl = `redis://${ACL_USER}:${ACL_PASSWORD}@127.0.0.1:6379`;
    const client = new (ZuweilaClient as any)({ redis: readerUrl, prefix: PREFIX });
    await client.connect();

    expect(client.isEnabled('enabled-flag', 'any-user')).toBe(true);

    await client.disconnect();
  });

  it('respects overrides under ACL', async () => {
    const readerUrl = `redis://${ACL_USER}:${ACL_PASSWORD}@127.0.0.1:6379`;
    const client = new (ZuweilaClient as any)({ redis: readerUrl, prefix: PREFIX });
    await client.connect();

    expect(client.isEnabled('rollout-flag', 'forced-user')).toBe(true);

    await client.disconnect();
  });

  it('pub/sub works under read-only ACL', async () => {
    const readerUrl = `redis://${ACL_USER}:${ACL_PASSWORD}@127.0.0.1:6379`;
    const client = new (ZuweilaClient as any)({ redis: readerUrl, prefix: PREFIX });
    await client.connect();

    expect(client.isEnabled('enabled-flag')).toBe(true);

    await admin.hset(key('flags:enabled-flag'), 'enabled', 'false');
    await admin.publish(
      key('changes'),
      JSON.stringify({ flagKey: 'enabled-flag', type: 'disabled', timestamp: new Date().toISOString() }),
    );

    await new Promise(r => setTimeout(r, 80));
    expect(client.isEnabled('enabled-flag')).toBe(false);

    await client.disconnect();
  });

  it('SDK never issues a write command — no HSET, DEL, SADD, PUBLISH in source', () => {
    const { readFileSync } = require('node:fs');
    const { resolve } = require('node:path');
    const clientSrc = readFileSync(resolve(__dirname, '../src/client.ts'), 'utf8');
    const adapterSrc = readFileSync(resolve(__dirname, '../../zuweila-core/src/storage/redis-adapter.ts'), 'utf8');

    const writeCommands = ['.hset(', '.hdel(', '.sadd(', '.srem(', '.del(', '.lpush(', '.publish('];
    for (const cmd of writeCommands) {
      expect(clientSrc, `client.ts must not call ${cmd}`).not.toContain(cmd);
      expect(adapterSrc, `core redis-adapter.ts must not call ${cmd}`).not.toContain(cmd);
    }
  });
});
