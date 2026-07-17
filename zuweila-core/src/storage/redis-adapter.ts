import { Redis } from 'ioredis';
import type { Flag, ChangeEvent } from '../types';
import type { StorageAdapter } from './adapter';

export class RedisAdapter implements StorageAdapter {
  protected readonly redis: Redis;
  protected readonly prefix: string;
  protected subscriber: Redis | null = null;

  constructor(redis: Redis, prefix: string) {
    this.redis = redis;
    this.prefix = prefix;
  }

  protected buildKey(name: string): string {
    return `${this.prefix}${name}`;
  }

  async getFlag(key: string): Promise<Flag | null> {
    const raw = await this.redis.hgetall(this.buildKey(`flags:${key}`));
    if (!raw || Object.keys(raw).length === 0) return null;
    return {
      key: raw.key,
      enabled: raw.enabled === 'true',
      rollout_pct: Number(raw.rollout_pct ?? 0),
      description: raw.description ?? '',
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    };
  }

  async listFlags(): Promise<Flag[]> {
    const keys = await this.redis.smembers(this.buildKey('flag_keys'));
    if (keys.length === 0) return [];
    const flags = await Promise.all(keys.map((k: string) => this.getFlag(k)));
    return flags.filter((f): f is Flag => f !== null);
  }

  async getOverrides(key: string): Promise<Record<string, boolean>> {
    const raw = await this.redis.hgetall(this.buildKey(`overrides:${key}`));
    if (!raw) return {};
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]: [string, string]) => [k, v === 'true']),
    );
  }

  async onChange(callback: (event: ChangeEvent) => void): Promise<void> {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(this.buildKey('changes'));
    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        callback(JSON.parse(message) as ChangeEvent);
      } catch {
        // malformed message — ignore
      }
    });
  }

  disconnectSubscriber(): void {
    this.subscriber?.disconnect();
    this.subscriber = null;
  }

  async disconnect(): Promise<void> {
    this.disconnectSubscriber();
    this.redis.disconnect();
  }
}
