// Client half of app/src/lib/invoiceMeta.ts — keep in sync. (The cleaners stay server-side.)

/** amount = base units string; due = unix ms end of day (0 = none); done = freelancer says this part is finished. */
export type Part = { name: string; amount: string; due: number; done: boolean };
/** escrows[i] holds parts[i] once the client pays; payer is set then. */
export type Invoice = { id: string; owner: string; title: string; days: number; parts: Part[]; payer: string | null; escrows: string[]; sentTo: string | null };

export const MAX_PARTS = 3;

export const partsTotal = (parts: Pick<Part, "amount">[]) => parts.reduce((a, p) => a + BigInt(p.amount), 0n);

export type PartStatus = "paid" | "done" | "overdue" | "pending";
/** `settled` = its held money reached the freelancer. Paid beats done beats overdue. */
export function partStatus(p: Pick<Part, "done" | "due">, settled: boolean, now = Date.now()): PartStatus {
  if (settled) return "paid";
  if (p.done) return "done";
  return p.due && now > p.due ? "overdue" : "pending";
}
