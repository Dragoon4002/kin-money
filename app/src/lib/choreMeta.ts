// Chore labels (title, due) aren't onchain. Shared by /api/chores and the chores screens. No imports: node-checkable.
// Checks: scripts/check-chore-meta.mts.

/** Title safe to store and show: no control/format chars (keeps emoji joiners), trimmed, ≤40 chars. Empty → null. */
export function cleanTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Array.from(v.replace(/(?!‍)[\p{Cc}\p{Cf}]/gu, "").trim()).slice(0, 40).join("").trim();
  return t || null;
}

/** "1,2,3" → ["1","2","3"] (deduped). Null when missing, malformed or more than 50. */
export function parseIds(s: string | null): string[] | null {
  if (!s) return null;
  const ids = [...new Set(s.split(","))];
  return ids.length <= 50 && ids.every((i) => /^[1-9]\d{0,29}$/.test(i)) ? ids : null;
}

/** Due date in unix seconds, or 0 for none/invalid. */
export const cleanDue = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2 ** 32 ? v : 0);
