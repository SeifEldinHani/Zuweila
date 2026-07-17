import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import Redis from 'ioredis';
import { WriteRedisAdapter as RedisAdapter } from '../src/storage/redis-adapter';
import { createCommand } from '../src/commands/create';
import { listCommand } from '../src/commands/list';
import { getCommand } from '../src/commands/get';
import { enableCommand } from '../src/commands/enable';
import { disableCommand } from '../src/commands/disable';
import { deleteCommand } from '../src/commands/delete';

const TEST_PREFIX = 'zuweila-crud-test:';
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

describe('createCommand', () => {
  it('creates a flag and publishes a change event', async () => {
    const published: unknown[] = [];
    vi.spyOn(adapter, 'publish').mockImplementation(async (e) => { published.push(e); });

    await createCommand(adapter, 'new-flag', { description: 'test', disabled: false });

    expect(await adapter.flagExists('new-flag')).toBe(true);
    expect(published).toHaveLength(1);
    expect((published[0] as { type: string }).type).toBe('created');

    vi.restoreAllMocks();
  });

  it('writes an audit event on create', async () => {
    await createCommand(adapter, 'audit-flag', { description: '', disabled: false });
    const raw = await redis.lrange(`${TEST_PREFIX}events:audit-flag`, 0, -1);
    expect(raw.length).toBeGreaterThan(0);
    expect(JSON.parse(raw[0]).type).toBe('created');
  });

  it('rejects duplicate key creation with a clear error', async () => {
    await createCommand(adapter, 'dupe', { description: '', disabled: false });
    await expect(
      createCommand(adapter, 'dupe', { description: '', disabled: false }),
    ).rejects.toThrow(/already exists/);
  });

  it('creates a flag in disabled state when --disabled is passed', async () => {
    await createCommand(adapter, 'off-flag', { description: '', disabled: true });
    const flag = await adapter.getFlag('off-flag');
    expect(flag!.enabled).toBe(false);
  });
});

describe('listCommand', () => {
  it('prints "No flags found." when empty', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => output.push(msg));
    await listCommand(adapter);
    expect(output.join('')).toMatch(/No flags found/);
    vi.restoreAllMocks();
  });

  it('lists all flags with state', async () => {
    await adapter.createFlag('alpha', 'first', true);
    await adapter.createFlag('beta', 'second', false);
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => output.push(msg));
    await listCommand(adapter);
    vi.restoreAllMocks();
    const joined = output.join('\n');
    expect(joined).toMatch(/alpha/);
    expect(joined).toMatch(/beta/);
  });
});

describe('getCommand', () => {
  it('prints full flag details', async () => {
    await adapter.createFlag('detailed', 'my desc', true);
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => output.push(msg));
    await getCommand(adapter, 'detailed');
    vi.restoreAllMocks();
    const joined = output.join('\n');
    expect(joined).toMatch(/detailed/);
    expect(joined).toMatch(/my desc/);
    expect(joined).toMatch(/overrides/);
  });

  it('throws for a non-existent flag', async () => {
    await expect(getCommand(adapter, 'ghost')).rejects.toThrow(/does not exist/);
  });
});

describe('enableCommand', () => {
  it('sets enabled=true, writes audit event, publishes change', async () => {
    await adapter.createFlag('toggler', '', false);
    const published: unknown[] = [];
    vi.spyOn(adapter, 'publish').mockImplementation(async (e) => { published.push(e); });

    await enableCommand(adapter, 'toggler');

    expect((await adapter.getFlag('toggler'))!.enabled).toBe(true);
    expect((published[0] as { type: string }).type).toBe('enabled');
    const raw = await redis.lrange(`${TEST_PREFIX}events:toggler`, 0, -1);
    expect(JSON.parse(raw[0]).type).toBe('enabled');
    vi.restoreAllMocks();
  });

  it('throws for a non-existent flag', async () => {
    await expect(enableCommand(adapter, 'ghost')).rejects.toThrow(/does not exist/);
  });
});

describe('disableCommand', () => {
  it('sets enabled=false, writes audit event, publishes change', async () => {
    await adapter.createFlag('active', '', true);
    const published: unknown[] = [];
    vi.spyOn(adapter, 'publish').mockImplementation(async (e) => { published.push(e); });

    await disableCommand(adapter, 'active');

    expect((await adapter.getFlag('active'))!.enabled).toBe(false);
    expect((published[0] as { type: string }).type).toBe('disabled');
    const raw = await redis.lrange(`${TEST_PREFIX}events:active`, 0, -1);
    expect(JSON.parse(raw[0]).type).toBe('disabled');
    vi.restoreAllMocks();
  });

  it('throws for a non-existent flag', async () => {
    await expect(disableCommand(adapter, 'ghost')).rejects.toThrow(/does not exist/);
  });
});

describe('deleteCommand', () => {
  it('removes the flag, writes audit event, publishes change', async () => {
    await adapter.createFlag('doomed', '', true);
    const published: unknown[] = [];
    vi.spyOn(adapter, 'publish').mockImplementation(async (e) => { published.push(e); });

    await deleteCommand(adapter, 'doomed');

    expect(await adapter.flagExists('doomed')).toBe(false);
    expect((published[0] as { type: string }).type).toBe('deleted');
    vi.restoreAllMocks();
  });

  it('throws for a non-existent flag', async () => {
    await expect(deleteCommand(adapter, 'ghost')).rejects.toThrow(/does not exist/);
  });
});

describe('no ioredis imports in command files', () => {
  it('command files do not import ioredis directly', () => {
    const { readFileSync } = require('node:fs');
    const { resolve } = require('node:path');
    const dir = resolve(__dirname, '../src/commands');
    const files = ['create.ts', 'list.ts', 'get.ts', 'enable.ts', 'disable.ts', 'delete.ts'];
    for (const file of files) {
      const content = readFileSync(resolve(dir, file), 'utf8');
      expect(content, `${file} must not import ioredis`).not.toMatch(/from ['"]ioredis['"]/);
    }
  });
});
