import type { WriteStorageAdapter } from '../storage/adapter';
import { evaluate } from 'zuweila-sdk';

export async function evaluateCommand(adapter: WriteStorageAdapter, key: string, contextKey?: string): Promise<void> {
  const flag = await adapter.getFlag(key);
  if (!flag) {
    throw new Error(`Flag "${key}" does not exist.`);
  }

  const overrides = await adapter.getOverrides(key);
  const result = evaluate(flag, overrides, contextKey);

  console.log(result ? 'true' : 'false');
}
