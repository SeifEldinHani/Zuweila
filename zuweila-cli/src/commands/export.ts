import { writeFileSync } from 'node:fs';
import { dump } from 'js-yaml';
import type { WriteStorageAdapter } from '../storage/adapter';

export async function exportCommand(adapter: WriteStorageAdapter, outputPath?: string): Promise<void> {
  const flags = await adapter.listFlags();

  const entries = await Promise.all(
    flags.map(async (flag) => {
      const overrides = await adapter.getOverrides(flag.key);
      const entry: Record<string, unknown> = {
        key: flag.key,
        description: flag.description,
        enabled: flag.enabled,
        rollout_pct: flag.rollout_pct,
      };
      if (Object.keys(overrides).length > 0) {
        entry.overrides = overrides;
      }
      return entry;
    }),
  );

  entries.sort((a, b) => String(a.key).localeCompare(String(b.key)));

  const yaml = dump({ flags: entries }, { lineWidth: -1 });

  if (outputPath) {
    writeFileSync(outputPath, yaml, 'utf8');
    console.log(`Exported ${entries.length} flag(s) to ${outputPath}`);
  } else {
    process.stdout.write(yaml);
  }
}
