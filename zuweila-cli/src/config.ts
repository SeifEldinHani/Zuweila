const DEFAULT_PREFIX = 'zuweila:';

export function getRedisUrl(): string {
  const url = process.env.ZUWEILA_REDIS_URL;
  if (!url) {
    throw new Error(
      'ZUWEILA_REDIS_URL environment variable is not set.\n' +
      'Example: export ZUWEILA_REDIS_URL=redis://localhost:6379',
    );
  }
  return url;
}

export function getPrefix(override?: string): string {
  return override ?? process.env.ZUWEILA_PREFIX ?? DEFAULT_PREFIX;
}
