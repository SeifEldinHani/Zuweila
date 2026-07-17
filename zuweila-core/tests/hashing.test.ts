import { describe, it, expect } from 'vitest';
import { isInRollout } from '../src/hashing';

describe('isInRollout', () => {
  it('returns false when rolloutPct is 0', () => {
    expect(isInRollout('my-flag', 'user-1', 0)).toBe(false);
    expect(isInRollout('my-flag', 'user-2', 0)).toBe(false);
  });

  it('returns true when rolloutPct is 100', () => {
    expect(isInRollout('my-flag', 'user-1', 100)).toBe(true);
    expect(isInRollout('my-flag', 'user-2', 100)).toBe(true);
  });

  it('is deterministic — same inputs always produce the same result', () => {
    for (let i = 0; i < 100; i++) {
      const a = isInRollout('feature-x', `user-${i}`, 50);
      const b = isInRollout('feature-x', `user-${i}`, 50);
      expect(a).toBe(b);
    }
  });

  it('increasing rollout never flips a previously-true key to false', () => {
    const keys = Array.from({ length: 500 }, (_, i) => `user-${i}`);
    const included25 = new Set(keys.filter((k) => isInRollout('flag', k, 25)));
    const included50 = new Set(keys.filter((k) => isInRollout('flag', k, 50)));
    const included75 = new Set(keys.filter((k) => isInRollout('flag', k, 75)));

    for (const key of included25) {
      expect(included50.has(key), `${key} was in 25% but dropped from 50%`).toBe(true);
    }
    for (const key of included50) {
      expect(included75.has(key), `${key} was in 50% but dropped from 75%`).toBe(true);
    }
  });

  it('distribution across 10 000 keys approximates rollout % (±5%)', () => {
    const total = 10_000;
    const pct = 40;
    const count = Array.from({ length: total }, (_, i) => `user-${i}`)
      .filter((k) => isInRollout('dist-flag', k, pct)).length;
    const actual = (count / total) * 100;
    expect(actual).toBeGreaterThan(pct - 5);
    expect(actual).toBeLessThan(pct + 5);
  });

  it('different flag keys hash differently for the same context key', () => {
    const results = new Set(
      ['flag-a', 'flag-b', 'flag-c', 'flag-d', 'flag-e'].map((f) =>
        isInRollout(f, 'same-user', 50),
      ),
    );
    // With 5 different flags it is overwhelmingly likely both true and false appear
    expect(results.size).toBeGreaterThan(1);
  });
});
