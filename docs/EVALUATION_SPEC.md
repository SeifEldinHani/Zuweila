# Evaluation Specification

This document is the authoritative reference for how Zuweila evaluates feature
flags. Any client implementation — in any language — that reads from the same
Redis store must follow this spec exactly to produce identical results.

---

## Redis Key Schema

All keys are prefixed with a configurable string (default: `zuweila:`).

| Key pattern | Type | Description |
|---|---|---|
| `{prefix}flag_keys` | Set | All flag keys (strings) currently defined |
| `{prefix}flags:{flagKey}` | Hash | Flag definition fields (see below) |
| `{prefix}overrides:{flagKey}` | Hash | Per-context-key override values |
| `{prefix}changes` | Pub/Sub channel | Change event stream (JSON payloads) |
| `{prefix}events:{flagKey}` | List | Append-only audit log for a flag |

### Flag hash fields

| Field | Type | Description |
|---|---|---|
| `key` | string | The flag's identifier (matches the key in `flag_keys`) |
| `enabled` | `"true"` / `"false"` | Master on/off switch |
| `rollout_pct` | `"0"` – `"100"` | Percentage of traffic to include |
| `description` | string | Human-readable label |
| `created_at` | ISO 8601 | Creation timestamp |
| `updated_at` | ISO 8601 | Last-modified timestamp |

### Override hash fields

Each field in `{prefix}overrides:{flagKey}` is:

```
contextKey → "true" | "false"
```

An entry forces the result for that specific context key regardless of rollout.

---

## Evaluation Algorithm

Given a `flagKey`, a set of `overrides`, and an optional `contextKey`:

```
function evaluate(flag, overrides, contextKey) -> bool:
  1. if flag.enabled == false:
       return false

  2. if contextKey is provided AND contextKey in overrides:
       return overrides[contextKey]

  3. if flag.rollout_pct <= 0:
       return false

  4. if flag.rollout_pct >= 100:
       return true

  5. if contextKey is NOT provided:
       return false

  6. bucket = murmurhash3_x86_32(flagKey + ":" + contextKey, seed=0) % 100
     return bucket < flag.rollout_pct
```

Steps are evaluated in order. The first matching condition wins.

---

## Hash Function Pin

**Algorithm:** MurmurHash3, x86-32 variant  
**Seed:** 0  
**Input:** UTF-8 string `flagKey + ":" + contextKey` (concatenated with a literal colon)  
**Output interpretation:** treat the 32-bit result as **unsigned** before taking modulo 100

This is pinned so all language implementations produce bit-identical bucket
assignments for the same inputs.

### TypeScript reference (imurmurhash)

```ts
import MurmurHash3 from 'imurmurhash';

function isInRollout(flagKey: string, contextKey: string, rolloutPct: number): boolean {
  const input = `${flagKey}:${contextKey}`;
  const hash = MurmurHash3(input).result();
  const bucket = (hash >>> 0) % 100; // >>> 0 forces unsigned interpretation
  return bucket < rolloutPct;
}
```

### Python reference (mmh3)

```python
import mmh3

def is_in_rollout(flag_key: str, context_key: str, rollout_pct: int) -> bool:
    combined = f"{flag_key}:{context_key}"
    bucket = mmh3.hash(combined, 0, signed=False) % 100  # signed=False → unsigned
    return bucket < rollout_pct
```

> **Warning:** `mmh3.hash()` returns a signed 32-bit integer by default.
> Pass `signed=False` to get the unsigned value. Using the signed result will
> produce wrong bucket assignments for hashes above 2³¹ − 1.

### Other languages

| Language | Library | Unsigned call |
|---|---|---|
| Go | `github.com/spaolacci/murmur3` | `murmur3.Sum32WithSeed([]byte(input), 0)` |
| Ruby | `digest/murmurhash` or `mmh3` gem | use `unsigned: true` if available |
| Java | Guava `Hashing.murmur3_32_fixed(0)` | result is already unsigned-safe via long cast |

For any language not listed, verify your implementation against the test vectors
in `zuweila-core/tests/cross-language.test.ts`.

---

## Change Event Format

Messages published to `{prefix}changes` are JSON objects:

```json
{
  "flagKey": "my-flag",
  "type": "enabled",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

Valid `type` values: `created`, `enabled`, `disabled`, `deleted`,
`rollout_updated`, `override_set`, `override_removed`.

SDK clients should subscribe to this channel and patch their in-memory cache
on each message rather than doing a full reload.
