import { Redis } from 'ioredis';
import { getRedisUrl, writeConfig } from '../config';

interface InitOptions {
  prefix: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const url = getRedisUrl();
  const redis = new Redis(url, { lazyConnect: true });

  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    redis.disconnect();
    throw new Error(`Could not connect to Redis at ${url}: ${(err as Error).message}`);
  }

  redis.disconnect();
  writeConfig(options.prefix);
  console.log(`Connected successfully. Config written to .zuweila.yml (prefix: ${options.prefix})`);
}
