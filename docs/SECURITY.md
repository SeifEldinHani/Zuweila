# Security

## Redis ACL Setup

Zuweila uses Redis as its only data store. Redis 6.0+ supports ACL users that
restrict which commands a given credential can issue. Zuweila ships with two
intended credential roles:

### `zuweila-reader` — SDK and direct-Redis consumers

Allowed commands: `HGETALL`, `SMEMBERS`, `SUBSCRIBE`, `PSUBSCRIBE`
Key scope: `zuweila:*` (or your configured prefix)

```
ACL SETUSER zuweila-reader on >CHANGE_ME_READER_PASSWORD \
  ~zuweila:* \
  &zuweila:* \
  -@all \
  +HGETALL \
  +SMEMBERS \
  +SUBSCRIBE \
  +PSUBSCRIBE
```

> **Redis 7+ note:** The `&zuweila:*` line grants access to pub/sub channels
> matching that pattern. Redis 6 did not have channel-level ACLs — on Redis 6
> the `&` line is not required and can be omitted.

This credential is safe to distribute to application servers and any non-npm
codebase reading flags directly from Redis. It cannot mutate any key.

### `zuweila-writer` — CLI and CI/CD pipelines

Allowed commands: `HSET`, `HDEL`, `SADD`, `SREM`, `LPUSH`, `LTRIM`, `LRANGE`,
`PUBLISH`, `DEL`, plus the reader commands above.
Key scope: `zuweila:*`

```
ACL SETUSER zuweila-writer on >CHANGE_ME_WRITER_PASSWORD \
  ~zuweila:* \
  &zuweila:* \
  -@all \
  +HSET \
  +HDEL \
  +SADD \
  +SREM \
  +LPUSH \
  +LTRIM \
  +LRANGE \
  +PUBLISH \
  +DEL \
  +HGETALL \
  +SMEMBERS \
  +SUBSCRIBE \
  +PSUBSCRIBE
```

Distribute this credential narrowly — CI/CD pipelines and operator machines
only. It should not reach individual developer laptops or application servers
where practical.

---

## Credential Model — What ACLs Actually Protect

Redis ACLs restrict what a given credential **can do**, not who **can hold** one.

Concretely: a `zuweila-reader` credential cannot call `HSET` — Redis will
reject the command. But Redis has no mechanism to enforce that only the
official `zuweila-sdk` holds that credential. Any client, written in any
language, that presents a valid `zuweila-reader` username and password gets
the same access the SDK gets.

The real security boundary is **credential distribution**: how carefully you
manage who receives the connection string. Redis ACLs are a useful second line
of defense — they limit blast radius if a reader credential leaks — but they
are not a technical lock that makes `zuweila:*` keys exclusively accessible
to the official SDK.

Recommended practices:

- Store connection strings in a secrets manager (AWS Secrets Manager,
  Vault, etc.), not in source code or environment files committed to git.
- Rotate credentials on a schedule and immediately after any suspected exposure.
- Audit Redis ACL users periodically: `ACL LIST` shows every user and their
  permissions.

---

## SDK Security Posture

The `zuweila-sdk` is read-only by design. Under any code path it only issues:
`HGETALL`, `SMEMBERS`, `SUBSCRIBE`, `PSUBSCRIBE`. It never calls `HSET`,
`DEL`, `PUBLISH`, or any other write command.

You can verify this by auditing the source:

```bash
grep -rn "\.hset\|\.del\|\.sadd\|\.publish\|\.lpush" zuweila-sdk/src/
# should return no results
```

### The `{ client }` constructor avoids credential exposure

When you pass an existing Redis client to the SDK:

```ts
const client = new Redis(process.env.REDIS_URL);
const flags = new ZuweilaClient({ client });
```

The SDK never sees your connection string or password — it only receives a
connected client object. This mirrors how ORMs and other infrastructure
libraries integrate into existing applications, and means you can grant the
SDK read-only access without ever handing it writer credentials.

### Recommended credential distribution

| Consumer | Credential |
|---|---|
| Application servers using `zuweila-sdk` | `zuweila-reader` |
| Non-npm services reading flags directly | `zuweila-reader` |
| CI/CD pipelines (SDK evaluation only) | `zuweila-reader` |
| CLI operators running `zuweila` commands | `zuweila-writer` |
| Developer laptops (if possible) | `zuweila-reader` only |

CI/CD pipelines only need `zuweila-writer` if you are using `zuweila seed`
to apply version-controlled flag definitions automatically on deploy. If
flags are managed manually by operators through the CLI, pipelines have no
reason to write and should only hold `zuweila-reader`.
