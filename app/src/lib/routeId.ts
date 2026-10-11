// Opaque ids for detail-page URLs (/pot/<id>, /circle/<id>, …). NOT wired in yet: during user testing URLs keep
// plain numeric ids so a broken page can be traced straight to its onchain id. To switch on, build every detail
// URL with idSeg() and parse every [id] param with idOf() (old numeric links keep working; pages check membership).
// Mobile copy: mobile/src/lib/routeId.ts — keep in sync.
// ponytail: keyless 64-bit bijection (multiply by an odd constant, xor) — hides counts and stops casual guessing,
// not real secrecy (the data is public onchain). Ids are contract counters, far below 2^64.
const M = (1n << 64n) - 1n;
const K = 0x9e3779b97f4a7c15n;
const KINV = 0xf1de83e19937733dn; // K⁻¹ mod 2^64
const X = 0x5bd1e9955bd1e995n;

/** id → URL segment, e.g. 8n → "k…" (lowercase base36, no "-", so invoice "a-b-c" joins still work). */
export const idSeg = (id: bigint): string => "k" + (((id * K) & M) ^ X).toString(36);

/** URL segment → id. Accepts plain numbers (old links) and canonical idSeg() output; anything else → null. */
export function idOf(s: string): bigint | null {
  if (/^\d{1,30}$/.test(s)) return BigInt(s);
  if (!/^k[0-9a-z]{1,13}$/.test(s)) return null;
  let v = 0n;
  for (const c of s.slice(1)) v = v * 36n + BigInt(parseInt(c, 36));
  if (v > M) return null;
  const id = ((v ^ X) * KINV) & M;
  return idSeg(id) === s ? id : null;
}
