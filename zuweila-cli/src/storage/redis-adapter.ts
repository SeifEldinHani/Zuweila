import { RedisAdapter } from 'zuweila-sdk';
import type { ChangeType, ChangeEvent } from 'zuweila-sdk';
import type { WriteStorageAdapter } from './adapter';

export class WriteRedisAdapter extends RedisAdapter implements WriteStorageAdapter {
  async flagExists(key: string): Promise<boolean> {
    return (await this.redis.sismember(this.buildKey('flag_keys'), key)) === 1;
  }

  async createFlag(key: string, description: string, enabled: boolean): Promise<void> {
    const now = new Date().toISOString();
    await this.redis.hset(this.buildKey(`flags:${key}`), {
      key,
      enabled: enabled ? 'true' : 'false',
      rollout_pct: '0',
      description,
      created_at: now,
      updated_at: now,
    });
    await this.redis.sadd(this.buildKey('flag_keys'), key);
  }

  async setEnabled(key: string, enabled: boolean): Promise<void> {
    await this.redis.hset(this.buildKey(`flags:${key}`), {
      enabled: enabled ? 'true' : 'false',
      updated_at: new Date().toISOString(),
    });
  }

  async deleteFlag(key: string): Promise<void> {
    await this.redis.del(this.buildKey(`flags:${key}`));
    await this.redis.del(this.buildKey(`overrides:${key}`));
    await this.redis.srem(this.buildKey('flag_keys'), key);
  }

  async setRollout(key: string, percent: number): Promise<void> {
    await this.redis.hset(this.buildKey(`flags:${key}`), {
      rollout_pct: String(percent),
      updated_at: new Date().toISOString(),
    });
  }

  async setOverride(key: string, contextKey: string, value: boolean): Promise<void> {
    await this.redis.hset(this.buildKey(`overrides:${key}`), contextKey, value ? 'true' : 'false');
  }

  async removeOverride(key: string, contextKey: string): Promise<void> {
    await this.redis.hdel(this.buildKey(`overrides:${key}`), contextKey);
  }

  async appendAuditEvent(flagKey: string, type: ChangeType): Promise<void> {
    const listKey = this.buildKey(`events:${flagKey}`);
    const entry = JSON.stringify({ type, timestamp: new Date().toISOString() });
    await this.redis.lpush(listKey, entry);
    await this.redis.ltrim(listKey, 0, 999);
  }

  async publish(event: ChangeEvent): Promise<void> {
    await this.redis.publish(this.buildKey('changes'), JSON.stringify(event));
  }
}
