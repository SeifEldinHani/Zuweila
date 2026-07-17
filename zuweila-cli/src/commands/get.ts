import type { WriteStorageAdapter } from '../storage/adapter';

export async function getCommand(adapter: WriteStorageAdapter, key: string): Promise<void> {
  const flag = await adapter.getFlag(key);
  if (!flag) {
    throw new Error(`Flag "${key}" does not exist.`);
  }

  const overrides = await adapter.getOverrides(key);
  const overrideEntries = Object.entries(overrides);

  console.log(`key:         ${flag.key}`);
  console.log(`enabled:     ${flag.enabled}`);
  console.log(`rollout_pct: ${flag.rollout_pct}`);
  console.log(`description: ${flag.description}`);
  console.log(`created_at:  ${flag.created_at}`);
  console.log(`updated_at:  ${flag.updated_at}`);

  if (overrideEntries.length === 0) {
    console.log('overrides:   none');
  } else {
    console.log('overrides:');
    for (const [contextKey, value] of overrideEntries) {
      console.log(`  ${contextKey} → ${value}`);
    }
  }
}
