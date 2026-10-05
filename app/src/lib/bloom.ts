// Bloom filter of taken @handles. "no" = definitely not in the set, "yes" = maybe (~1% false positives).
export type Bloom = { m: number; k: number; bits: string }; // bits = base64

// murmur3 fmix over FNV-1a; two seeds feed double hashing.
function hash(s: string, seed: number) {
  let h = seed;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

function* positions(s: string, m: number, k: number) {
  const a = hash(s, 0x811c9dc5), b = hash(s, 0x9e3779b9) | 1;
  for (let i = 0; i < k; i++) yield ((a + Math.imul(i, b)) >>> 0) % m;
}

export function makeBloom(items: string[], p = 0.01): Bloom {
  const m = Math.max(64, Math.ceil((-items.length * Math.log(p)) / Math.LN2 ** 2));
  const k = Math.max(1, Math.round((m / Math.max(1, items.length)) * Math.LN2));
  const bytes = new Uint8Array(Math.ceil(m / 8));
  for (const s of items) for (const i of positions(s, m, k)) bytes[i >> 3] |= 1 << (i & 7);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return { m, k, bits: btoa(bin) };
}

/** Decode once, test many. */
export function loadBloom({ m, k, bits }: Bloom): (s: string) => boolean {
  const bytes = Uint8Array.from(atob(bits), (c) => c.charCodeAt(0));
  return (s) => { for (const i of positions(s, m, k)) if (!(bytes[i >> 3] & (1 << (i & 7)))) return false; return true; };
}
