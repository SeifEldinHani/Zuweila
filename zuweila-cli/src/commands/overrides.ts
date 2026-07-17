import type { WriteStorageAdapter } from '../storage/adapter';

export async function overridesCommand(adapter: WriteStorageAdapter, key: string): Promise<void> {
  const exists = await adapter.flagExists(key);
  if (!exists) {
    throw new Error(`Flag "${key}" does not exist.`);
  }

  const overrides = await adapter.getOverrides(key);
  const entries = Object.entries(overrides);

  if (entries.length === 0) {
    console.log(`No overrides set for flag "${key}".`);
    return;
  }

  console.log(`Overrides for "${key}":`);
  for (const [contextKey, value] of entries) {
    console.log(`  ${contextKey} → ${value}`);
  }
}
