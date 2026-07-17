import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const CONFIG_FILE = '.zuweila.yml';
const DEFAULT_PREFIX = 'zuweila:';

interface Config {
  prefix: string;
}

function configPath(): string {
  return path.resolve(process.cwd(), CONFIG_FILE);
}

export function readConfig(): Config {
  const filePath = configPath();
  if (!fs.existsSync(filePath)) {
    return { prefix: DEFAULT_PREFIX };
  }
  const raw = yaml.load(fs.readFileSync(filePath, 'utf8')) as Partial<Config>;
  return { prefix: raw?.prefix ?? DEFAULT_PREFIX };
}

export function writeConfig(prefix: string): void {
  const config: Config = { prefix };
  fs.writeFileSync(configPath(), yaml.dump(config), 'utf8');
}

export function getRedisUrl(): string {
  const url = process.env.ZUWEILA_REDIS_URL;
  if (!url) {
    throw new Error('ZUWEILA_REDIS_URL environment variable is not set.');
  }
  return url;
}
