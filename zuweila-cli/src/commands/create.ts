import type { WriteStorageAdapter } from '../storage/adapter';

interface CreateOptions {
  description: string;
  disabled: boolean;
}

export async function createCommand(
  adapter: WriteStorageAdapter,
  key: string,
  options: CreateOptions,
): Promise<void> {
  const exists = await adapter.flagExists(key);
  if (exists) {
    throw new Error(`Flag "${key}" already exists. Use enable/disable to change its state.`);
  }

  const enabled = !options.disabled;
  await adapter.createFlag(key, options.description, enabled);
  await adapter.appendAuditEvent(key, 'created');

  const event = { flagKey: key, type: 'created' as const, timestamp: new Date().toISOString() };
  await adapter.publish(event);

  console.log(`Flag "${key}" created (${enabled ? 'enabled' : 'disabled'}).`);
}
