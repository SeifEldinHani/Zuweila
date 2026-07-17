import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Redis from 'ioredis';
import { WriteRedisAdapter as RedisAdapter } from '../src/storage/redis-adapter';
import { seedCommand } from '../src/commands/seed';

const TEST_PREFIX = 'zuweila-seed-test:';
const redis = new Redis(process.env.ZUWEILA_REDIS_URL ?? 'redis://localhost:6379');
const adapter = new RedisAdapter(redis, TEST_PREFIX);

async function flushTestKeys(): Promise<void> {
  const keys = await redis.keys(`${TEST_PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
}

function writeTempYaml(content: string): string {
  const path = join(tmpdir(), `zuweila-seed-test-${Date.now()}.yml`);
  writeFileSync(path, content, 'utf8');
  return path;
}

beforeEach(async () => {
  await flushTestKeys();
});

afterAll(async () => {
  await flushTestKeys();
  await adapter.disconnect();
});

describe('seedCommand', () => {
  it('creates a flag that does not yet exist', async () => {
    const file = writeTempYaml(`
flags:
  - key: brand-new-flag
    description: Created by seed
    enabled: true
    rollout_pct: 0
`);
    await seedCommand(adapter, file);
    unlinkSync(file);

    expect(await adapter.flagExists('brand-new-flag')).toBe(true);
    const flag = await adapter.getFlag('brand-new-flag');
    expect(flag!.enabled).toBe(true);
    expect(flag!.description).toBe('Created by seed');
  });

  it('updates rollout_pct on an existing flag without duplicate-create error', async () => {
    await adapter.createFlag('existing-flag', 'pre-existing', true);

    const file = writeTempYaml(`
flags:
  - key: existing-flag
    enabled: true
    rollout_pct: 75
`);
    await seedCommand(adapter, file);
    unlinkSync(file);

    const flag = await adapter.getFlag('existing-flag');
    expect(flag!.rollout_pct).toBe(75);
  });

  it('applies overrides from the YAML file', async () => {
    const file = writeTempYaml(`
flags:
  - key: override-flag
    enabled: true
    rollout_pct: 50
    overrides:
      power-user: true
      blocked-user: false
`);
    await seedCommand(adapter, file);
    unlinkSync(file);

    const overrides = await adapter.getOverrides('override-flag');
    expect(overrides['power-user']).toBe(true);
    expect(overrides['blocked-user']).toBe(false);
  });

  it('is idempotent — running seed twice produces the same state', async () => {
    const yaml = `
flags:
  - key: idempotent-flag
    enabled: true
    rollout_pct: 30
    overrides:
      tester: true
`;
    const file1 = writeTempYaml(yaml);
    await seedCommand(adapter, file1);
    unlinkSync(file1);

    const file2 = writeTempYaml(yaml);
    await seedCommand(adapter, file2);
    unlinkSync(file2);

    const flag = await adapter.getFlag('idempotent-flag');
    expect(flag!.rollout_pct).toBe(30);
    expect(flag!.enabled).toBe(true);
    const overrides = await adapter.getOverrides('idempotent-flag');
    expect(overrides['tester']).toBe(true);
  });

  it('rejects malformed YAML with a clear error', async () => {
    const file = writeTempYaml(`
flags:
  - key: [unclosed bracket
    enabled: true
`);
    await expect(seedCommand(adapter, file)).rejects.toThrow(/Malformed YAML/);
    unlinkSync(file);
  });
});
