// Invoice parts (name, amount, due, done) live server-side (/api/invoices); the pay link carries only the id.
// Shared by the API and the invoice screens. No imports: node-checkable (scripts/check-invoice-parts.mts).
// Mobile copy of the client half: mobile/src/components/invoice/meta.ts — keep in sync.

/** amount = base units string; due = unix ms end of day (0 = none); done = freelancer says this part is finished. */
export type Part = { name: string; amount: string; due: number; done: boolean };
/** escrows[i] holds parts[i] once the client pays; payer is set then. Addresses are checksummed. */
export type Invoice = { id: string; owner: string; title: string; days: number; parts: Part[]; payer: string | null; escrows: string[]; sentTo: string | null };

const DAY = 86_400_000;
export const MAX_PARTS = 3;

/** Text safe to store and show: no control/format chars (keeps emoji joiners), trimmed, ≤max chars. Empty → null. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = Array.from(v.replace(/(?!‍)[\p{Cc}\p{Cf}]/gu, "").trim()).slice(0, max).join("").trim();
  return t || null;
}

/** Untrusted parts → 1–3 clean parts (not done), or null if any amount/due is invalid. Unnamed parts become "Part n". */
export function cleanParts(v: unknown, now = Date.now()): Part[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_PARTS) return null;
  const out: Part[] = [];
  for (const [i, p] of v.entries()) {
    if (!p || typeof p !== "object") return null;
    const { name, amount, due } = p as Record<string, unknown>;
    if (typeof amount !== "string" || !/^[1-9]\d{0,14}$/.test(amount)) return null;
    const d = due == null || due === 0 ? 0 : Number.isSafeInteger(due) && (due as number) > now - DAY && (due as number) < now + 366 * DAY ? (due as number) : null;
    if (d === null) return null;
    out.push({ name: cleanText(name, 30) ?? `Part ${i + 1}`, amount, due: d, done: false });
  }
  return out;
}

/** "If they don't reply, pay me after N days": 1–60, else null. */
export const cleanDays = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 60 ? (v as number) : null);

/** Server-made ids: 12 base64url chars. */
export const isInvoiceId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{12}$/.test(v);

export const partsTotal = (parts: Pick<Part, "amount">[]) => parts.reduce((a, p) => a + BigInt(p.amount), 0n);

export type PartStatus = "paid" | "done" | "overdue" | "pending";
/** `settled` = its held money reached the freelancer. Paid beats done beats overdue. */
export function partStatus(p: Pick<Part, "done" | "due">, settled: boolean, now = Date.now()): PartStatus {
  if (settled) return "paid";
  if (p.done) return "done";
  return p.due && now > p.due ? "overdue" : "pending";
}
