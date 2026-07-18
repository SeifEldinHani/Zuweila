# zuweila-sdk

TypeScript SDK for [Zuweila](https://github.com/SeifEldinHani/Zuweila) — feature flags that live in your existing Redis.

Loads all flags into memory on startup, evaluates them locally with zero Redis calls on the hot path, and stays in sync in real-time via pub/sub.

## Installation

```bash
npm install zuweila-sdk
```

Requires Node 20+ and an [ioredis](https://github.com/redis/ioredis)-compatible Redis instance.

## Quick Start

```ts
import { ZuweilaClient } from 'zuweila-sdk';

const flags = ZuweilaClient.getInstance({
  redis: process.env.ZUWEILA_REDIS_URL,
  onDisconnect: 'fail-closed',
});

await flags.connect();

// In your request handler
if (flags.isEnabled('new-checkout', req.user.id)) {
  return newCheckoutFlow();
}
return legacyCheckoutFlow();
```

If you already have an ioredis client in your app, pass it directly to reuse the connection:

```ts
import { Redis } from 'ioredis';
import { ZuweilaClient } from 'zuweila-sdk';

const redis = new Redis(process.env.ZUWEILA_REDIS_URL);

const flags = ZuweilaClient.getInstance({ client: redis });
await flags.connect();
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `redis` | `string` | — | Redis connection URL. Either this or `client` is required. |
| `client` | `Redis` | — | Existing ioredis instance to reuse. Either this or `redis` is required. |
| `prefix` | `string` | `"zuweila:"` | Key prefix. Must match what the CLI uses. |
| `onDisconnect` | `string` | `"fail-closed"` | Behavior when Redis connection is lost. See below. |
| `onMetric` | `function` | — | Optional callback for observability events. |

## Disconnect Modes

| Mode | Behavior |
|---|---|
| `fail-closed` | All flags return `false` when Redis is unreachable. Safe default. |
| `fail-open` | All flags return `true` when Redis is unreachable. |
| `last-known-cache` | Uses the last known flag state. Falls back to `false` if never connected. |

## Events

```ts
flags.on('ready', () => console.log('flags loaded'));
flags.on('unknown_flag', (key) => console.warn(`unknown flag: ${key}`));
flags.on('missing_context_key', (key) => console.warn(`no context key for rollout flag: ${key}`));
```

| Event | When |
|---|---|
| `ready` | Flags loaded and pub/sub subscribed after `connect()` |
| `unknown_flag` | `isEnabled()` called with a flag key that doesn't exist |
| `missing_context_key` | `isEnabled()` called without a context key on a partial-rollout flag |

## Cleanup

```ts
await flags.disconnect();
```

Call this during graceful shutdown. If the SDK owns the Redis connection (URL was passed), it closes it. If you passed an existing client, only the pub/sub subscriber is closed.

## Managing Flags

Use the [zuweila CLI](https://www.npmjs.com/package/zuweila) to create, enable, and manage flags.

```bash
npm install -g zuweila
export ZUWEILA_REDIS_URL=redis://localhost:6379

zuweila create dark-mode
zuweila rollout dark-mode --percent 20
zuweila enable dark-mode
```

## License

MIT
