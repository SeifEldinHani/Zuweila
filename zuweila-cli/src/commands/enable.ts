import type { WriteStorageAdapter } from '../storage/adapter';

export async function enableCommand(adapter: WriteStorageAdapter, key: string): Promise<void> {
  const exists = await adapter.flagExists(key);
  if (!exists) {
    throw new Error(`Flag "${key}" does not exist.`);
  }

  await adapter.setEnabled(key, true);
  await adapter.appendAuditEvent(key, 'enabled');
  await adapter.publish({ flagKey: key, type: 'enabled', timestamp: new Date().toISOString() });

  console.log(`Flag "${key}" enabled.`);
}
