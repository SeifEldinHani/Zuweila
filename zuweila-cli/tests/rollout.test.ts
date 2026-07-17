import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import Redis from 'ioredis';
import { WriteRedisAdapter as RedisAdapter } from '../src/storage/redis-adapter';
import { rolloutCommand } from '../src/commands/rollout';
import { overrideCommand } from '../src/commands/override';
import { overridesCommand } from '../src/commands/overrides';
import { evaluateCommand } from '../src/commands/evaluate';

const TEST_PREFIX = 'zuweila-rollout-test:';
const redis = new Redis(process.env.ZUWEILA_REDIS_URL ?? 'redis://localhost:6379');
const adapter = new RedisAdapter(redis, TEST_PREFIX);

async function flushTestKeys(): Promise<void> {
  const keys = await redis.keys(`${TEST_PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
}

beforeEach(async () => {
  await flushTestKeys();
  await adapter.createFlag('my-flag', 'test flag', true);
});

afterAll(async () => {
  await flushTestKeys();
  await adapter.disconnect();
});

describe('rolloutCommand', () => {
  it('sets rollout_pct on the flag', async () => {
    await rolloutCommand(adapter, 'my-flag', 42);
    expect((await adapter.getFlag('my-flag'))!.rollout_pct).toBe(42);
  });

  it('writes an audit event and publishes a change', async () => {
    const published: unknown[] = [];
    vi.spyOn(adapter, 'publish').mockImplementation(async (e) => { published.push(e); });
    await rolloutCommand(adapter, 'my-flag', 25);
    expect((published[0] as { type: string }).type).toBe('rollout_updated');
    const raw = await redis.lrange(`${TEST_PREFIX}events:my-flag`, 0, -1);
    expect(JSON.parse(raw[0]).type).toBe('rollout_updated');
    vi.restoreAllMocks();
  });

  it('rejects percent outside 0-100', async () => {
    await expect(rolloutCommand(adapter, 'my-flag', 101)).rejects.toThrow(/0 and 100/);
    await expect(rolloutCommand(adapter, 'my-flag', -1)).rejects.toThrow(/0 and 100/);
  });

  it('throws for a non-existent flag', async () => {
    await expect(rolloutCommand(adapter, 'ghost', 50)).rejects.toThrow(/does not exist/);
  });
});

describe('overrideCommand', () => {
  it('sets override to true and publishes', async () => {
    const published: unknown[] = [];
    vi.spyOn(adapter, 'publish').mockImplementation(async (e) => { published.push(e); });
    await overrideCommand(adapter, 'my-flag', { overrideKey: 'user-99', value: 'true' });
    const overrides = await adapter.getOverrides('my-flag');
    expect(overrides['user-99']).toBe(true);
    expect((published[0] as { type: string }).type).toBe('override_set');
    vi.restoreAllMocks();
  });

  it('sets override to false', async () => {
    await overrideCommand(adapter, 'my-flag', { overrideKey: 'user-99', value: 'false' });
    expect((await adapter.getOverrides('my-flag'))['user-99']).toBe(false);
  });

  it('removes override and falls back to rollout', async () => {
    await overrideCommand(adapter, 'my-flag', { overrideKey: 'user-99', value: 'true' });
    await overrideCommand(adapter, 'my-flag', { overrideKey: 'user-99', remove: true });
    const overrides = await adapter.getOverrides('my-flag');
    expect('user-99' in overrides).toBe(false);
  });

  it('rejects --value not true/false', async () => {
    await expect(
      overrideCommand(adapter, 'my-flag', { overrideKey: 'user-1', value: 'yes' }),
    ).rejects.toThrow(/"true" or "false"/);
  });

  it('throws when neither --value nor --remove provided', async () => {
    await expect(
      overrideCommand(adapter, 'my-flag', { overrideKey: 'user-1' }),
    ).rejects.toThrow(/--value.*--remove/);
  });

  it('throws for a non-existent flag', async () => {
    await expect(
      overrideCommand(adapter, 'ghost', { overrideKey: 'user-1', value: 'true' }),
    ).rejects.toThrow(/does not exist/);
  });
});

describe('overridesCommand', () => {
  it('prints "no overrides" when none set', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m: string) => output.push(m));
    await overridesCommand(adapter, 'my-flag');
    vi.restoreAllMocks();
    expect(output.join('')).toMatch(/No overrides/);
  });

  it('lists all active overrides', async () => {
    await adapter.setOverride('my-flag', 'user-1', true);
    await adapter.setOverride('my-flag', 'user-2', false);
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m: string) => output.push(m));
    await overridesCommand(adapter, 'my-flag');
    vi.restoreAllMocks();
    const joined = output.join('\n');
    expect(joined).toMatch(/user-1/);
    expect(joined).toMatch(/user-2/);
  });
});

describe('evaluateCommand', () => {
  it('prints true for a fully enabled flag', async () => {
    await adapter.setRollout('my-flag', 100);
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m: string) => output.push(m));
    await evaluateCommand(adapter, 'my-flag', 'any-user');
    vi.restoreAllMocks();
    expect(output[0]).toBe('true');
  });

  it('prints false for a 0% rollout flag', async () => {
    await adapter.setRollout('my-flag', 0);
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m: string) => output.push(m));
    await evaluateCommand(adapter, 'my-flag', 'any-user');
    vi.restoreAllMocks();
    expect(output[0]).toBe('false');
  });

  it('override true forces true on a 0% rollout flag', async () => {
    await adapter.setRollout('my-flag', 0);
    await adapter.setOverride('my-flag', 'special-user', true);
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m: string) => output.push(m));
    await evaluateCommand(adapter, 'my-flag', 'special-user');
    vi.restoreAllMocks();
    expect(output[0]).toBe('true');
  });

  it('throws for a non-existent flag', async () => {
    await expect(evaluateCommand(adapter, 'ghost', 'user-1')).rejects.toThrow(/does not exist/);
  });
});
