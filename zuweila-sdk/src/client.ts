import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { RedisAdapter, evaluate } from 'zuweila-core';
import type { Flag, ChangeEvent } from 'zuweila-core';

type DisconnectMode = 'fail-closed' | 'fail-open' | 'last-known-cache';

interface ZuweilaClientOptions {
  redis?: string;
  client?: Redis;
  prefix?: string;
  onDisconnect?: DisconnectMode;
  onMetric?: (name: string, dimensions: Record<string, string>) => void;
}

export class ZuweilaClient extends EventEmitter {
  private static _instance: ZuweilaClient | null = null;

  private readonly adapter: RedisAdapter;
  private readonly ownedRedis: Redis | null;
  private readonly disconnectMode: DisconnectMode;
  private readonly onMetric?: (name: string, dimensions: Record<string, string>) => void;

  private flagCache = new Map<string, Flag>();
  private overrideCache = new Map<string, Record<string, boolean>>();
  private hasConnected = false;
  private isDisconnected = false;

  private constructor(options: ZuweilaClientOptions) {
    super();

    let redis: Redis;
    if (options.client) {
      redis = options.client;
      this.ownedRedis = null;
    } else if (options.redis) {
      redis = new Redis(options.redis, { lazyConnect: true, enableReadyCheck: false });
      this.ownedRedis = redis;
    } else {
      throw new Error('ZuweilaClient requires either { redis } or { client } option.');
    }

    const prefix = options.prefix ?? 'zuweila:';
    this.adapter = new RedisAdapter(redis, prefix);
    this.disconnectMode = options.onDisconnect ?? 'fail-closed';
    this.onMetric = options.onMetric;
  }

  static getInstance(options?: ZuweilaClientOptions): ZuweilaClient {
    if (!ZuweilaClient._instance) {
      if (!options) {
        throw new Error('ZuweilaClient.getInstance() requires options on first call.');
      }
      ZuweilaClient._instance = new ZuweilaClient(options);
    }
    return ZuweilaClient._instance;
  }

  static _resetInstance(): void {
    ZuweilaClient._instance = null;
  }

  async connect(): Promise<void> {
    if (this.ownedRedis) {
      await this.ownedRedis.connect();
      this.ownedRedis.on('error', () => {
        this.isDisconnected = true;
      });
    }

    const flags = await this.adapter.listFlags();
    for (const flag of flags) {
      this.flagCache.set(flag.key, flag);
      const overrides = await this.adapter.getOverrides(flag.key);
      this.overrideCache.set(flag.key, overrides);
    }

    await this.adapter.onChange((event: ChangeEvent) => this.patchCache(event));

    this.hasConnected = true;
    this.emit('ready');
  }

  private patchCache(event: ChangeEvent): void {
    if (event.type === 'deleted') {
      this.flagCache.delete(event.flagKey);
      this.overrideCache.delete(event.flagKey);
      return;
    }

    this.adapter.getFlag(event.flagKey).then(flag => {
      if (flag) this.flagCache.set(event.flagKey, flag);
    }).catch(() => {});

    if (event.type === 'override_set' || event.type === 'override_removed') {
      this.adapter.getOverrides(event.flagKey).then(overrides => {
        this.overrideCache.set(event.flagKey, overrides);
      }).catch(() => {});
    }
  }

  isEnabled(flagKey: string, contextKey?: string): boolean {
    if (!this.hasConnected || this.isDisconnected) {
      return this.disconnectDefault(flagKey);
    }

    const flag = this.flagCache.get(flagKey);
    if (!flag) {
      this.emit('unknown_flag', flagKey);
      this.onMetric?.('unknown_flag', { flagKey });
      return false;
    }

    const overrides = this.overrideCache.get(flagKey) ?? {};

    if (contextKey === undefined && flag.rollout_pct > 0 && flag.rollout_pct < 100) {
      this.emit('missing_context_key', flagKey);
      this.onMetric?.('missing_context_key', { flagKey });
      return false;
    }

    return evaluate(flag, overrides, contextKey);
  }

  private disconnectDefault(flagKey: string): boolean {
    switch (this.disconnectMode) {
      case 'fail-open':
        return true;
      case 'last-known-cache': {
        if (!this.hasConnected) return false;
        const flag = this.flagCache.get(flagKey);
        if (!flag) return false;
        const overrides = this.overrideCache.get(flagKey) ?? {};
        return evaluate(flag, overrides);
      }
      default:
        return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.ownedRedis) {
      await this.adapter.disconnect();
    } else {
      this.adapter.disconnectSubscriber();
    }
  }
}
