import type { WriteStorageAdapter } from '../storage/adapter';

export async function deleteCommand(adapter: WriteStorageAdapter, key: string): Promise<void> {
  const exists = await adapter.flagExists(key);
  if (!exists) {
    throw new Error(`Flag "${key}" does not exist.`);
  }

  await adapter.appendAuditEvent(key, 'deleted');
  await adapter.publish({ flagKey: key, type: 'deleted', timestamp: new Date().toISOString() });
  await adapter.deleteFlag(key);

  console.log(`Flag "${key}" deleted.`);
}
