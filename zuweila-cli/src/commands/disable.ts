import type { WriteStorageAdapter } from '../storage/adapter';

export async function disableCommand(adapter: WriteStorageAdapter, key: string): Promise<void> {
  const exists = await adapter.flagExists(key);
  if (!exists) {
    throw new Error(`Flag "${key}" does not exist.`);
  }

  await adapter.setEnabled(key, false);
  await adapter.appendAuditEvent(key, 'disabled');
  await adapter.publish({ flagKey: key, type: 'disabled', timestamp: new Date().toISOString() });

  console.log(`Flag "${key}" disabled.`);
}
