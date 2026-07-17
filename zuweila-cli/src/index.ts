#!/usr/bin/env node
import { Command } from 'commander';
import Redis from 'ioredis';
import { getRedisUrl, getPrefix } from './config';
import { WriteRedisAdapter } from './storage/redis-adapter';
import { createCommand } from './commands/create';
import { listCommand } from './commands/list';
import { getCommand } from './commands/get';
import { enableCommand } from './commands/enable';
import { disableCommand } from './commands/disable';
import { deleteCommand } from './commands/delete';
import { rolloutCommand } from './commands/rollout';
import { overrideCommand } from './commands/override';
import { overridesCommand } from './commands/overrides';
import { evaluateCommand } from './commands/evaluate';
import { seedCommand } from './commands/seed';
import { exportCommand } from './commands/export';

const program = new Command();

program
  .name('zuweila')
  .description('Feature flags in your existing Redis')
  .version('0.1.0')
  .option('--prefix <prefix>', 'Key prefix (overrides ZUWEILA_PREFIX env var)');

async function withAdapter(fn: (adapter: WriteRedisAdapter) => Promise<void>): Promise<void> {
  const opts = program.opts<{ prefix?: string }>();
  const url = getRedisUrl();
  const prefix = getPrefix(opts.prefix);
  const redis = new Redis(url);
  const adapter = new WriteRedisAdapter(redis, prefix);
  try {
    await fn(adapter);
  } finally {
    await adapter.disconnect();
  }
}

program
  .command('create <key>')
  .description('Create a new feature flag')
  .option('--description <text>', 'Flag description', '')
  .option('--disabled', 'Create the flag in disabled state', false)
  .action(async (key: string, options: { description: string; disabled: boolean }) => {
    try {
      await withAdapter((adapter) => createCommand(adapter, key, options));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all feature flags')
  .action(async () => {
    try {
      await withAdapter((adapter) => listCommand(adapter));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('get <key>')
  .description('Show full details of a feature flag')
  .action(async (key: string) => {
    try {
      await withAdapter((adapter) => getCommand(adapter, key));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('enable <key>')
  .description('Enable a feature flag')
  .action(async (key: string) => {
    try {
      await withAdapter((adapter) => enableCommand(adapter, key));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('disable <key>')
  .description('Disable a feature flag')
  .action(async (key: string) => {
    try {
      await withAdapter((adapter) => disableCommand(adapter, key));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('delete <key>')
  .description('Delete a feature flag')
  .action(async (key: string) => {
    try {
      await withAdapter((adapter) => deleteCommand(adapter, key));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('rollout <key>')
  .description('Set rollout percentage for a flag')
  .requiredOption('--percent <number>', 'Rollout percentage (0-100)', parseInt)
  .action(async (key: string, options: { percent: number }) => {
    try {
      await withAdapter((adapter) => rolloutCommand(adapter, key, options.percent));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('override <key>')
  .description('Set or remove a per-entity override for a flag')
  .requiredOption('--overrideKey <value>', 'Context key to override (e.g. user ID)')
  .option('--value <true|false>', 'Override value')
  .option('--remove', 'Remove the override', false)
  .action(async (key: string, options: { overrideKey: string; value?: string; remove: boolean }) => {
    try {
      await withAdapter((adapter) => overrideCommand(adapter, key, options));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('overrides <key>')
  .description('List all active overrides for a flag')
  .action(async (key: string) => {
    try {
      await withAdapter((adapter) => overridesCommand(adapter, key));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('evaluate <key>')
  .description('Evaluate a flag for a given context key')
  .option('--key <contextValue>', 'Context key (e.g. user ID)')
  .action(async (key: string, options: { key?: string }) => {
    try {
      await withAdapter((adapter) => evaluateCommand(adapter, key, options.key));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('seed <file>')
  .description('Apply a YAML file of flag definitions (create-or-update, never deletes)')
  .action(async (file: string) => {
    try {
      await withAdapter((adapter) => seedCommand(adapter, file));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Dump all flags and overrides to YAML (stdout by default)')
  .option('--output <file>', 'Write to a file instead of stdout')
  .action(async (options: { output?: string }) => {
    try {
      await withAdapter((adapter) => exportCommand(adapter, options.output));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
