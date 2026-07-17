import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { load } from 'js-yaml';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Redis from 'ioredis';
import { WriteRedisAdapter as RedisAdapter } from '../src/storage/redis-adapter';
import { exportCommand } from '../src/commands/export';
import { seedCommand } from '../src/commands/seed';

const TEST_PREFIX = 'zuweila-export-test:';
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

describe('exportCommand', () => {
  it('YAML output contains all flags with correct field values', async () => {
    await adapter.createFlag('alpha', 'Alpha flag', true);
    await adapter.setRollout('alpha', 40);
    await adapter.createFlag('beta', 'Beta flag', false);

    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { lines.push(String(chunk)); return true; };

    await exportCommand(adapter);

    process.stdout.write = original;

    const yaml = lines.join('');
    const parsed = load(yaml) as { flags: Array<Record<string, unknown>> };
    const keys = parsed.flags.map((f) => f.key).sort();
    expect(keys).toEqual(['alpha', 'beta']);

    const alpha = parsed.flags.find((f) => f.key === 'alpha')!;
    expect(alpha.enabled).toBe(true);
    expect(alpha.rollout_pct).toBe(40);
    expect(alpha.description).toBe('Alpha flag');
  });

  it('export YAML includes per-flag overrides', async () => {
    await adapter.createFlag('with-overrides', '', true);
    await adapter.setOverride('with-overrides', 'internal', true);
    await adapter.setOverride('with-overrides', 'blocked', false);

    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { lines.push(String(chunk)); return true; };

    await exportCommand(adapter);

    process.stdout.write = original;

    const parsed = load(lines.join('')) as { flags: Array<Record<string, unknown>> };
    const flag = parsed.flags.find((f) => f.key === 'with-overrides')!;
    const overrides = flag.overrides as Record<string, boolean>;
    expect(overrides['internal']).toBe(true);
    expect(overrides['blocked']).toBe(false);
  });

  it('round-trip: export output fed back into seed produces identical Redis state', async () => {
    await adapter.createFlag('rt-flag', 'round-trip', true);
    await adapter.setRollout('rt-flag', 60);
    await adapter.setOverride('rt-flag', 'user-a', true);

    const outFile = join(tmpdir(), `zuweila-export-rt-${Date.now()}.yml`);
    await exportCommand(adapter, outFile);

    await flushTestKeys();

    await seedCommand(adapter, outFile);
    unlinkSync(outFile);

    const flag = await adapter.getFlag('rt-flag');
    expect(flag!.enabled).toBe(true);
    expect(flag!.rollout_pct).toBe(60);
    expect(flag!.description).toBe('round-trip');

    const overrides = await adapter.getOverrides('rt-flag');
    expect(overrides['user-a']).toBe(true);
  });
});
