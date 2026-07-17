import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import { evaluate } from '../src/evaluation';

const REDIS_URL = process.env.ZUWEILA_REDIS_URL ?? 'redis://localhost:6379';
const PREFIX = 'cross-lang-test:';
const PYTHON_SCRIPT = resolve(__dirname, '../../examples/python-reader/evaluate.py');

const PAIRS: Array<{ flagKey: string; contextKey: string }> = [
  { flagKey: 'alpha', contextKey: 'user-1' },
  { flagKey: 'alpha', contextKey: 'user-2' },
  { flagKey: 'beta', contextKey: 'user-abc' },
  { flagKey: 'beta', contextKey: 'user-xyz' },
  { flagKey: 'gamma', contextKey: 'session-1000' },
  { flagKey: 'gamma', contextKey: 'session-2000' },
  { flagKey: 'delta', contextKey: 'org-42' },
  { flagKey: 'delta', contextKey: 'org-99' },
  { flagKey: 'epsilon', contextKey: 'device-aaa' },
  { flagKey: 'epsilon', contextKey: 'device-bbb' },
];

function pythonAvailable(): boolean {
  const result = spawnSync('python3', ['-c', 'import mmh3'], { timeout: 5000 });
  return result.status === 0;
}

function runPython(flagKey: string, contextKey: string): boolean {
  const result = spawnSync(
    'python3',
    [PYTHON_SCRIPT, '--flag', flagKey, '--context', contextKey, '--redis', REDIS_URL, '--prefix', PREFIX],
    { timeout: 5000, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`Python exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout.trim() === 'true';
}

const redis = new Redis(REDIS_URL);

async function seedFlag(flagKey: string, rolloutPct: number): Promise<void> {
  const now = new Date().toISOString();
  await redis.hset(`${PREFIX}flags:${flagKey}`, {
    key: flagKey,
    enabled: 'true',
    rollout_pct: String(rolloutPct),
    description: '',
    created_at: now,
    updated_at: now,
  });
  await redis.sadd(`${PREFIX}flag_keys`, flagKey);
}

async function flushTestKeys(): Promise<void> {
  const keys = await redis.keys(`${PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
}

const flagKeys = [...new Set(PAIRS.map((p) => p.flagKey))];

beforeAll(async () => {
  if (!pythonAvailable()) return;
  await flushTestKeys();
  for (const flagKey of flagKeys) {
    await seedFlag(flagKey, 50);
  }
});

afterAll(async () => {
  await flushTestKeys();
  redis.disconnect();
});

describe.skipIf(!pythonAvailable())('cross-language evaluation equivalence (50% rollout)', () => {
  for (const { flagKey, contextKey } of PAIRS) {
    it(`${flagKey} + ${contextKey} → TypeScript and Python agree`, async () => {
      const flag = await redis.hgetall(`${PREFIX}flags:${flagKey}`);
      const tsFlag = {
        key: flag.key,
        enabled: flag.enabled === 'true',
        rollout_pct: Number(flag.rollout_pct),
        description: flag.description,
        created_at: flag.created_at,
        updated_at: flag.updated_at,
      };
      const tsResult = evaluate(tsFlag, {}, contextKey);
      const pyResult = runPython(flagKey, contextKey);

      expect(pyResult).toBe(tsResult);
    });
  }
});
