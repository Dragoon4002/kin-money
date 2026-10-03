// Port of app/src/lib/split.ts — keep in sync.
/**
 * Trip splitting maths (pure, bigint base units — AUSD 6 decimals).
 * expense → per-person shares; net balances; fewest-transfers settle-up.
 */
export type Expense = { payer: string; amount: bigint; participants: string[] };
export type Transfer = { from: string; to: string; amount: bigint };

/** Split `amount` across `participants` evenly; leftover base units go to the first ones (deterministic). */
export function shares(amount: bigint, participants: string[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  const n = BigInt(participants.length);
  if (n === 0n) return out;
  const base = amount / n;
  let rest = amount % n;
  for (const p of participants) {
    out.set(p, (out.get(p) ?? 0n) + base + (rest > 0n ? 1n : 0n));
    if (rest > 0n) rest--;
  }
  return out;
}

/** Net balance per member: + is owed money, − owes money. Sums to 0. */
export function balances(members: string[], expenses: Expense[], settled: Transfer[] = []): Map<string, bigint> {
  const b = new Map<string, bigint>(members.map((m) => [m, 0n]));
  const add = (k: string, v: bigint) => b.set(k, (b.get(k) ?? 0n) + v);
  for (const e of expenses) {
    add(e.payer, e.amount);
    for (const [p, s] of shares(e.amount, e.participants)) add(p, -s);
  }
  // A settlement payment from → to reduces what `from` owes and what `to` is owed.
  for (const t of settled) {
    add(t.from, t.amount);
    add(t.to, -t.amount);
  }
  return b;
}

/**
 * Settle-up plan: greedily match the biggest debtor with the biggest creditor.
 * ponytail: greedy gives ≤ n−1 transfers (optimal min is NP-hard; greedy is what Splitwise-style apps use).
 */
export function settleUp(bal: Map<string, bigint>): Transfer[] {
  const debt = [...bal].filter(([, v]) => v < 0n).map(([k, v]) => ({ k, v: -v }));
  const cred = [...bal].filter(([, v]) => v > 0n).map(([k, v]) => ({ k, v }));
  const byAmt = (a: { k: string; v: bigint }, b: { k: string; v: bigint }) => (b.v > a.v ? 1 : b.v < a.v ? -1 : a.k.localeCompare(b.k));
  const out: Transfer[] = [];
  while (debt.length && cred.length) {
    debt.sort(byAmt);
    cred.sort(byAmt);
    const d = debt[0], c = cred[0];
    const amt = d.v < c.v ? d.v : c.v;
    out.push({ from: d.k, to: c.k, amount: amt });
    d.v -= amt;
    c.v -= amt;
    if (d.v === 0n) debt.shift();
    if (c.v === 0n) cred.shift();
  }
  return out;
}
