import { isInRollout } from './hashing';
import type { Flag } from './types';

export function evaluate(
  flag: Flag,
  overrides: Record<string, boolean>,
  contextKey?: string,
): boolean {
  if (!flag.enabled) return false;

  if (contextKey !== undefined && contextKey in overrides) {
    return overrides[contextKey];
  }

  if (flag.rollout_pct <= 0) return false;
  if (flag.rollout_pct >= 100) return true;

  if (contextKey === undefined) return false;

  return isInRollout(flag.key, contextKey, flag.rollout_pct);
}
