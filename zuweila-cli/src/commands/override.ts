import type { WriteStorageAdapter } from '../storage/adapter';

interface OverrideOptions {
  overrideKey: string;
  value?: string;
  remove?: boolean;
}

export async function overrideCommand(adapter: WriteStorageAdapter, key: string, options: OverrideOptions): Promise<void> {
  const exists = await adapter.flagExists(key);
  if (!exists) {
    throw new Error(`Flag "${key}" does not exist.`);
  }

  if (options.remove) {
    await adapter.removeOverride(key, options.overrideKey);
    await adapter.appendAuditEvent(key, 'override_removed');
    await adapter.publish({ flagKey: key, type: 'override_removed', timestamp: new Date().toISOString() });
    console.log(`Override for "${options.overrideKey}" removed from flag "${key}".`);
    return;
  }

  if (options.value === undefined) {
    throw new Error('Must provide --value <true|false> or --remove.');
  }
  if (options.value !== 'true' && options.value !== 'false') {
    throw new Error(`--value must be "true" or "false", got: "${options.value}"`);
  }

  const boolValue = options.value === 'true';
  await adapter.setOverride(key, options.overrideKey, boolValue);
  await adapter.appendAuditEvent(key, 'override_set');
  await adapter.publish({ flagKey: key, type: 'override_set', timestamp: new Date().toISOString() });
  console.log(`Override set: flag "${key}", context "${options.overrideKey}" → ${boolValue}.`);
}
