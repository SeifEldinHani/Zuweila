import type { WriteStorageAdapter } from '../storage/adapter';

export async function rolloutCommand(adapter: WriteStorageAdapter, key: string, percent: number): Promise<void> {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error(`Rollout percent must be an integer between 0 and 100, got: ${percent}`);
  }

  const exists = await adapter.flagExists(key);
  if (!exists) {
    throw new Error(`Flag "${key}" does not exist.`);
  }

  await adapter.setRollout(key, percent);
  await adapter.appendAuditEvent(key, 'rollout_updated');
  await adapter.publish({ flagKey: key, type: 'rollout_updated', timestamp: new Date().toISOString() });

  console.log(`Flag "${key}" rollout set to ${percent}%.`);
}
