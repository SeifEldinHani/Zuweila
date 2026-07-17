import type { WriteStorageAdapter } from '../storage/adapter';

export async function listCommand(adapter: WriteStorageAdapter): Promise<void> {
  const flags = await adapter.listFlags();

  if (flags.length === 0) {
    console.log('No flags found.');
    return;
  }

  for (const flag of flags) {
    const state = flag.enabled ? 'enabled' : 'disabled';
    const rollout = flag.rollout_pct > 0 ? ` (${flag.rollout_pct}% rollout)` : '';
    console.log(`  ${flag.key}  [${state}]${rollout}  ${flag.description}`);
  }
}
