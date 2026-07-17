import MurmurHash3 from 'imurmurhash';

// MurmurHash3 x86-32, seed 0 (imurmurhash default).
// Variant and seed are pinned so cross-language ports produce bit-identical results.
export function isInRollout(flagKey: string, contextKey: string, rolloutPct: number): boolean {
  const input = `${flagKey}:${contextKey}`;
  const hash = MurmurHash3(input).result();
  const bucket = (hash >>> 0) % 100;
  return bucket < rolloutPct;
}
