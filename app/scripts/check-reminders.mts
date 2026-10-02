// Run: node --experimental-strip-types --no-warnings scripts/check-reminders.mts
import assert from "node:assert/strict";
import { canRemind, cronNudge, DAY, dueLabel, endOfDay, REMIND_GAP, validDue } from "../src/lib/reminders.ts";

const now = new Date(2026, 9, 2, 10, 0).getTime(); // 2 Oct, 10:00 local
const H = 3_600_000;

// 12h rate limit
assert.ok(canRemind(null, now) && canRemind(undefined, now));
assert.ok(!canRemind(now - 1, now));
assert.ok(!canRemind(now - REMIND_GAP + 1, now));
assert.ok(canRemind(now - REMIND_GAP, now));

// due labels (calendar days, local)
assert.equal(dueLabel(endOfDay(now), now), "Due today");
assert.equal(dueLabel(endOfDay(now, 1), now), "Due tomorrow");
assert.equal(dueLabel(endOfDay(now, 3), now), "Due in 3 days");
assert.equal(dueLabel(endOfDay("2026-10-09"), now), "Due in 7 days");
assert.equal(dueLabel(now - 1, now), "Overdue");

// cron: due within 24h → tomorrow; exactly 1 or 3 days late → overdue; else nothing
assert.equal(cronNudge(now + 23 * H, now), "tomorrow");
assert.equal(cronNudge(now + 25 * H, now), null);
assert.equal(cronNudge(now - 2 * H, now), "overdue"); // day 1
assert.equal(cronNudge(now - 30 * H, now), null); // day 2
assert.equal(cronNudge(now - 2.5 * DAY, now), "overdue"); // day 3
assert.equal(cronNudge(now - 5 * DAY, now), null);
// daily runs over one request fire exactly: tomorrow, overdue(1), overdue(3)
const due = now + 12 * H;
const fired = [-1, 0, 1, 2, 3, 4, 5].map((d) => cronNudge(due, now + d * DAY)).filter(Boolean);
assert.deepEqual(fired, ["tomorrow", "overdue", "overdue"]);

// due validation
assert.ok(validDue(now + DAY, now) && !validDue(now - 2 * DAY, now) && !validDue(now + 400 * DAY, now) && !validDue("1", now) && !validDue(1.5, now));
console.log("reminders ok");
