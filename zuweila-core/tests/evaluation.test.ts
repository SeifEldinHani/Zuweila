import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/evaluation';
import type { Flag } from '../src/types';

function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    key: 'test-flag',
    enabled: true,
    rollout_pct: 100,
    description: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('evaluate', () => {
  it('returns false when flag is disabled, regardless of rollout or overrides', () => {
    const flag = makeFlag({ enabled: false, rollout_pct: 100 });
    expect(evaluate(flag, { 'user-1': true }, 'user-1')).toBe(false);
    expect(evaluate(flag, {}, 'user-1')).toBe(false);
  });

  it('returns false when rollout is 0%', () => {
    expect(evaluate(makeFlag({ rollout_pct: 0 }), {}, 'user-1')).toBe(false);
  });

  it('returns true when rollout is 100% and no override', () => {
    expect(evaluate(makeFlag({ rollout_pct: 100 }), {}, 'user-1')).toBe(true);
  });

  it('returns false when rollout is partial and no context key provided', () => {
    expect(evaluate(makeFlag({ rollout_pct: 50 }), {}, undefined)).toBe(false);
  });

  it('override true forces true regardless of rollout %', () => {
    const flag = makeFlag({ rollout_pct: 0 });
    expect(evaluate(flag, { 'user-1': true }, 'user-1')).toBe(true);
  });

  it('override false forces false regardless of rollout %', () => {
    const flag = makeFlag({ rollout_pct: 100 });
    expect(evaluate(flag, { 'user-1': false }, 'user-1')).toBe(false);
  });

  it('override only applies to the exact context key', () => {
    const flag = makeFlag({ rollout_pct: 0 });
    expect(evaluate(flag, { 'user-1': true }, 'user-2')).toBe(false);
  });

  it('evaluation without context key on a 100% flag returns true', () => {
    expect(evaluate(makeFlag({ rollout_pct: 100 }), {}, undefined)).toBe(true);
  });

  it('rollout evaluation is consistent with hashing for partial rollouts', () => {
    const flag = makeFlag({ key: 'rollout-flag', rollout_pct: 50 });
    const result1 = evaluate(flag, {}, 'stable-user');
    const result2 = evaluate(flag, {}, 'stable-user');
    expect(result1).toBe(result2);
  });
});
