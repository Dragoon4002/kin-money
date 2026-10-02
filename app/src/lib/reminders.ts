// Pure due-date + reminder rules, shared by UI, API and the daily cron. Times = unix ms.

export const DAY = 86_400_000;
/** A person can be nudged about the same request / trip debt at most once per 12h. */
export const REMIND_GAP = 12 * 3_600_000;

export const canRemind = (remindedAt: number | null | undefined, now = Date.now()) => !remindedAt || now - remindedAt >= REMIND_GAP;

/** Local end of day `days` from today, or of a "YYYY-MM-DD" date-input value. */
export function endOfDay(from: number | string, days = 0): number {
  const d = typeof from === "string" ? new Date(`${from}T00:00`) : new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Calendar days from today to `due` (0 = today, negative = past), local time. */
const daysUntil = (due: number, now: number) => Math.round((endOfDay(due) - endOfDay(now)) / DAY);

/** "Overdue" | "Due today" | "Due tomorrow" | "Due in 3 days". */
export function dueLabel(due: number, now = Date.now()): string {
  if (now > due) return "Overdue";
  const n = daysUntil(due, now);
  return n <= 0 ? "Due today" : n === 1 ? "Due tomorrow" : `Due in ${n} days`;
}

/**
 * Daily-cron nudge for an open request: due within the next 24h, or exactly 1 or 3 days late.
 * ponytail: 24h buckets assume one run per day; the 12h `canRemind` gap stops double sends on re-runs.
 */
export function cronNudge(due: number, now = Date.now()): "tomorrow" | "overdue" | null {
  if (due > now) return due - now <= DAY ? "tomorrow" : null;
  const late = Math.ceil((now - due) / DAY);
  return late === 1 || late === 3 ? "overdue" : null;
}

/** Valid due date from untrusted input: integer ms, from yesterday to a year out. */
export const validDue = (v: unknown, now = Date.now()): v is number =>
  Number.isSafeInteger(v) && (v as number) > now - DAY && (v as number) < now + 366 * DAY;
