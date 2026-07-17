#!/usr/bin/env python3
"""
Zuweila feature flag evaluator — direct Redis reader.

Usage:
    python3 evaluate.py --flag <flagKey> --context <contextKey> \
        [--redis redis://localhost:6379] [--prefix zuweila:]

Prints "true" or "false" to stdout.

Dependencies: pip install mmh3 redis
"""

import argparse
import sys
from typing import Optional

import mmh3
import redis as redis_lib


def is_in_rollout(flag_key: str, context_key: str, rollout_pct: int) -> bool:
    combined = f"{flag_key}:{context_key}"
    # MurmurHash3 x86-32, seed 0, unsigned — must match TypeScript imurmurhash
    bucket = mmh3.hash(combined, 0, signed=False) % 100
    return bucket < rollout_pct


def evaluate(flag: dict, overrides: dict, context_key: Optional[str]) -> bool:
    if flag.get("enabled") != "true":
        return False

    if context_key is not None and context_key in overrides:
        return overrides[context_key] == "true"

    rollout_pct = int(flag.get("rollout_pct", 0))

    if rollout_pct <= 0:
        return False
    if rollout_pct >= 100:
        return True

    if context_key is None:
        return False

    return is_in_rollout(flag["key"], context_key, rollout_pct)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a Zuweila feature flag")
    parser.add_argument("--flag", required=True, help="Flag key to evaluate")
    parser.add_argument("--context", default=None, help="Context key (e.g. user ID)")
    parser.add_argument("--redis", default="redis://localhost:6379", help="Redis URL")
    parser.add_argument("--prefix", default="zuweila:", help="Key prefix")
    args = parser.parse_args()

    client = redis_lib.from_url(args.redis, decode_responses=True)

    flag_hash = client.hgetall(f"{args.prefix}flags:{args.flag}")
    if not flag_hash:
        print("false")
        sys.exit(0)

    overrides = client.hgetall(f"{args.prefix}overrides:{args.flag}")

    result = evaluate(flag_hash, overrides, args.context)
    print("true" if result else "false")


if __name__ == "__main__":
    main()
