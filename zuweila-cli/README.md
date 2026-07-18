# zuweila

Feature flags that live in your existing Redis — no new infrastructure, no SaaS bill, no extra service to run.

## Installation

```bash
npm install -g zuweila
```

Requires Node 20+.

## Configuration

Set two environment variables:

```bash
export ZUWEILA_REDIS_URL=redis://localhost:6379
export ZUWEILA_PREFIX=myapp:   # optional, defaults to "zuweila:"
```

The prefix isolates your flags from other Redis data. Use it to share one Redis instance across multiple apps.

You can also pass `--prefix` per command:

```bash
zuweila --prefix myapp: list
```

## Commands

### Flag lifecycle

```bash
zuweila create <key>                        # create a flag (enabled by default)
zuweila create <key> --disabled             # create in disabled state
zuweila create <key> --description "text"

zuweila enable <key>
zuweila disable <key>
zuweila delete <key>
```

### Rollout

```bash
zuweila rollout <key> --percent <0-100>     # set rollout percentage
```

Rollouts are deterministic — the same user always lands in the same bucket across deploys and restarts.

### Overrides

```bash
# force a specific user on or off, regardless of rollout
zuweila override <key> --overrideKey <userId> --value true
zuweila override <key> --overrideKey <userId> --value false
zuweila override <key> --overrideKey <userId> --remove

zuweila overrides <key>                     # list all active overrides
```

### Inspect

```bash
zuweila list                                # list all flags
zuweila get <key>                           # full details for one flag
zuweila evaluate <key> --key <contextKey>   # evaluate a flag for a given user
```

### Seed & Export

```bash
zuweila seed flags.yml                      # apply a YAML file (create-or-update, never deletes)
zuweila export                              # dump all flags to stdout
zuweila export --output flags.yml           # dump to file
```

## Seed File Format

Define your flags in YAML and check the file into version control:

```yaml
flags:
  - key: dark-mode
    description: Dark mode toggle
    enabled: true
    rollout_pct: 20
    overrides:
      user-123: true   # always on for this user

  - key: new-checkout
    description: Redesigned checkout flow
    enabled: false
    rollout_pct: 0
```

Run `zuweila seed flags.yml` to apply it to any environment. Existing flags are updated; no flags are deleted.

## SDK

Use [zuweila-sdk](https://www.npmjs.com/package/zuweila-sdk) to evaluate flags inside your application:

```ts
import { ZuweilaClient } from 'zuweila-sdk';

const flags = ZuweilaClient.getInstance({ redis: process.env.ZUWEILA_REDIS_URL });
await flags.connect();

if (flags.isEnabled('dark-mode', userId)) {
  // ...
}
```

## License

MIT
