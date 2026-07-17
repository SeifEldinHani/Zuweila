# Zuweila

Feature flags in your existing Redis. No server to deploy, no database to provision, no dashboard to host.

Point the CLI and SDK at a Redis you already run and get instant, real-time feature flags.

---

## Quickstart (under 5 minutes)

### 1. Install the CLI

```bash
npm install -g zuweila
```

### 2. Set your environment variables

```bash
export ZUWEILA_REDIS_URL=redis://localhost:6379
export ZUWEILA_PREFIX=myapp:   # optional — defaults to 'zuweila:'
```

Add these to your `.env`, shell profile, or CI secrets. No config file needed.

### 3. Create your first flag

```bash
zuweila create new-checkout --description "New checkout flow"
zuweila rollout new-checkout --percent 10
```

You can also override the prefix per-command:

```bash
zuweila --prefix staging: create new-checkout
```

### 4. Install the SDK in your app

```bash
npm install zuweila-sdk
```

### 5. Evaluate flags at runtime

```ts
import { ZuweilaClient } from 'zuweila-sdk';

const flags = ZuweilaClient.getInstance({ redis: process.env.REDIS_URL });
await flags.connect();

if (flags.isEnabled('new-checkout', userId)) {
  // new experience
}
```

That's it. Flags update in real time via Redis pub/sub — no polling, no restarts.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Your Redis                           │
│                                                              │
│  zuweila:flags:<key>        HASH   flag definition           │
│  zuweila:flag_keys          SET    all flag keys             │
│  zuweila:overrides:<key>    HASH   per-entity overrides      │
│  zuweila:events:<key>       LIST   audit log (last 1000)     │
│  zuweila:changes            PUBSUB real-time change stream   │
└──────────────────────────────────────────────────────────────┘
         ▲  write (HSET, SADD, PUBLISH)        ▲  read (HGETALL, SMEMBERS, SUBSCRIBE)
         │                                      │
  ┌──────┴──────┐                       ┌───────┴──────┐
  │  zuweila    │                       │  zuweila-sdk  │
  │    CLI      │                       │  (your app)   │
  └─────────────┘                       └───────────────┘
```

**How evaluation works:**

1. `enabled == false` → `false`
2. Context key has an explicit override → return the override value
3. `rollout_pct == 0` → `false` / `rollout_pct == 100` → `true`
4. `murmurhash3(flagKey + ':' + contextKey, seed=0) % 100 < rollout_pct`

The hash function is deterministic: the same user always gets the same result. Ramping rollout up only adds users, never removes them. See [docs/EVALUATION_SPEC.md](docs/EVALUATION_SPEC.md) for the full language-agnostic spec.

---

## CLI Reference

```
zuweila [--prefix <prefix>] <command>

zuweila create <key> [--description <text>] [--disabled]
zuweila list
zuweila get <key>
zuweila enable <key>
zuweila disable <key>
zuweila delete <key>
zuweila rollout <key> --percent <0-100>
zuweila override <key> --overrideKey <id> --value <true|false>
zuweila override <key> --overrideKey <id> --remove
zuweila overrides <key>
zuweila evaluate <key> [--key <contextValue>]
zuweila seed <file.yml>
zuweila export [--output <file.yml>]
```

### Seed files

Manage flags as code. Commit a YAML file and apply it anywhere:

```yaml
# flags.yml
flags:
  - key: new-checkout
    description: New checkout flow
    enabled: true
    rollout_pct: 10
    overrides:
      internal-tester-1: true
      problem-account: false

  - key: kill-switch
    description: Emergency kill switch
    enabled: true
    rollout_pct: 100
```

```bash
zuweila seed flags.yml        # create-or-update, never deletes
zuweila export > flags.yml    # dump current state back to YAML
```

Seed is **create-or-update only** — flags not mentioned in the file are left untouched.

---

## SDK Reference

### Constructor options

```ts
// SDK manages its own Redis connection
const flags = ZuweilaClient.getInstance({
  redis: 'redis://localhost:6379',
  prefix: 'zuweila:',           // optional, default 'zuweila:'
  onDisconnect: 'fail-closed',  // 'fail-closed' | 'fail-open' | 'last-known-cache'
  onMetric: (name, dims) => myMetrics.increment(name, dims),
});

// SDK reuses your existing Redis client (never sees your credentials)
const flags = ZuweilaClient.getInstance({ client: existingRedisClient });
```

### Connection failure modes

| Mode | Behavior on disconnect |
|---|---|
| `fail-closed` (default) | All flags return `false` |
| `fail-open` | All flags return `true` |
| `last-known-cache` | Serve the last cached values; behaves like `fail-closed` if never connected |

### Events

```ts
flags.on('ready', () => console.log('connected'));
flags.on('unknown_flag', (key) => logger.warn('unknown flag', { key }));
flags.on('missing_context_key', (key) => logger.warn('missing context', { key }));
```

---

## Flag patterns

### Gradual per-user rollout

```ts
// Consistent: same user always sees the same experience
flags.isEnabled('new-checkout', userId)
```

### Binary kill switch

```ts
// 100% rollout — on for everyone; disable instantly with `zuweila disable`
flags.isEnabled('payments-v2')
```

### Per-tenant rollout

```ts
// Roll out to tenants independently of users
flags.isEnabled('enterprise-dashboard', tenantSlug)
```

---

## Security

Zuweila uses Redis ACLs (Redis 6+) to enforce a read/write split:

**`zuweila-reader`** — for application servers and non-npm consumers:
```
ACL SETUSER zuweila-reader on >CHANGE_ME \
  ~zuweila:* &zuweila:* -@all \
  +HGETALL +SMEMBERS +SUBSCRIBE +PSUBSCRIBE
```

**`zuweila-writer`** — for CLI operators only:
```
ACL SETUSER zuweila-writer on >CHANGE_ME \
  ~zuweila:* &zuweila:* -@all \
  +HSET +HDEL +SADD +SREM +LPUSH +LTRIM +LRANGE +PUBLISH +DEL \
  +HGETALL +SMEMBERS +SUBSCRIBE +PSUBSCRIBE
```

The SDK is read-only by design and never issues a write command under any code path. See [docs/SECURITY.md](docs/SECURITY.md) for full details and credential distribution guidance.

### Non-npm consumers

Python, Go, or any other language can read flags directly from Redis using the published spec. See [docs/EVALUATION_SPEC.md](docs/EVALUATION_SPEC.md) and the [Python reference snippet](examples/python-reader/evaluate.py).

---

## Comparison

| | Zuweila | Flipt | Unleash | GrowthBook | Flagsmith |
|---|---|---|---|---|---|
| Infrastructure required | **Redis only** | Flipt server + DB | Unleash server + DB | GB server or cloud | FS server or cloud |
| Self-hosted | ✅ | ✅ | ✅ | ✅ | ✅ |
| Zero new services | **✅** | ❌ | ❌ | ❌ | ❌ |
| Real-time updates | ✅ pub/sub | ✅ | ✅ | polling | ✅ |
| Non-SDK language support | **✅ read spec** | via gRPC/REST | via REST | via REST | via REST |
| Gradual rollout | ✅ | ✅ | ✅ | ✅ | ✅ |
| Overrides / targeting | ✅ | ✅ | ✅ | ✅ | ✅ |
| Open source | ✅ | ✅ | ✅ | ✅ | ✅ |

**The differentiator:** if you already run Redis, Zuweila requires zero additional infrastructure — no server process to deploy, monitor, or keep alive. You get feature flags by pointing two commands at a host you already pay for.

---

## Configuration

No config file required. Everything is driven by environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `ZUWEILA_REDIS_URL` | Yes | — | Redis connection string |
| `ZUWEILA_PREFIX` | No | `zuweila:` | Key namespace |

Set these in your shell profile, `.env` file, CI secrets, or Kubernetes environment. The `--prefix` flag on the CLI overrides `ZUWEILA_PREFIX` for a single invocation.

Both the CLI and SDK must use the same prefix to see the same flags. Mismatched prefixes result in silently disjoint keysets.

---

## Contributing

```bash
git clone <repo>
cd zuweila
npm install        # installs all workspaces
npm test           # runs all tests (requires a local Redis on :6379)
```

Packages:
- `zuweila-cli/` — the `zuweila` CLI (`npm publish` from inside)
- `zuweila-sdk/` — the TypeScript SDK (`npm publish` from inside)
- `zuweila-core/` — shared evaluation logic (internal, not published)
- `examples/demo-app/` — Express demo app
- `examples/python-reader/` — Python direct-Redis reference snippet
