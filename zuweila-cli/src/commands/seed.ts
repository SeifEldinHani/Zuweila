import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import type { WriteStorageAdapter } from '../storage/adapter';

interface FlagEntry {
  key: string;
  description?: string;
  enabled?: boolean;
  rollout_pct?: number;
  overrides?: Record<string, boolean>;
}

interface SeedFile {
  flags: FlagEntry[];
}

function parseSeedFile(path: string): SeedFile {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Cannot read seed file: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = load(raw);
  } catch (err) {
    throw new Error(`Malformed YAML in ${path}: ${(err as Error).message}`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('flags' in parsed) ||
    !Array.isArray((parsed as SeedFile).flags)
  ) {
    throw new Error(`Seed file must have a top-level "flags" array.`);
  }

  return parsed as SeedFile;
}

export async function seedCommand(adapter: WriteStorageAdapter, filePath: string): Promise<void> {
  const { flags } = parseSeedFile(filePath);

  for (const entry of flags) {
    if (!entry.key || typeof entry.key !== 'string') {
      throw new Error(`Each flag entry must have a string "key" field.`);
    }

    const exists = await adapter.flagExists(entry.key);
    const enabled = entry.enabled ?? true;
    const description = entry.description ?? '';
    const rollout = entry.rollout_pct ?? 0;

    if (!exists) {
      await adapter.createFlag(entry.key, description, enabled);
      await adapter.appendAuditEvent(entry.key, 'created');
      await adapter.publish({ flagKey: entry.key, type: 'created', timestamp: new Date().toISOString() });
    } else {
      await adapter.setEnabled(entry.key, enabled);
      await adapter.appendAuditEvent(entry.key, enabled ? 'enabled' : 'disabled');
      await adapter.publish({ flagKey: entry.key, type: enabled ? 'enabled' : 'disabled', timestamp: new Date().toISOString() });
    }

    if (rollout !== 0 || exists) {
      await adapter.setRollout(entry.key, rollout);
      await adapter.appendAuditEvent(entry.key, 'rollout_updated');
      await adapter.publish({ flagKey: entry.key, type: 'rollout_updated', timestamp: new Date().toISOString() });
    }

    for (const [contextKey, value] of Object.entries(entry.overrides ?? {})) {
      await adapter.setOverride(entry.key, contextKey, value);
      await adapter.appendAuditEvent(entry.key, 'override_set');
      await adapter.publish({ flagKey: entry.key, type: 'override_set', timestamp: new Date().toISOString() });
    }

    console.log(`Seeded flag "${entry.key}".`);
  }

  console.log(`Done. ${flags.length} flag(s) applied.`);
}
