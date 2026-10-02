// Read-session token unit checks. Run: node --experimental-strip-types --no-warnings scripts/check-session.mts
import assert from "node:assert/strict";
import { signToken, verifyToken } from "../src/lib/server/session.ts";

const S = "test-secret";
const A = "0x1111111111111111111111111111111111111111";
const now = 1_800_000_000;
const t = signToken(A, now + 60, S);

assert.equal(verifyToken(t, S, now), A, "valid token");
assert.equal(verifyToken(t, S, now + 61), null, "expired");
assert.equal(verifyToken(t, "other", now), null, "wrong secret");
assert.equal(verifyToken(t, "", now), null, "no secret");
const [a, exp, sig] = t.split(".");
assert.equal(verifyToken(`${"0x2222222222222222222222222222222222222222"}.${exp}.${sig}`, S, now), null, "tampered address");
assert.equal(verifyToken(`${a}.${Number(exp) + 999}.${sig}`, S, now), null, "tampered expiry");
assert.equal(verifyToken(`${a}.${exp}.${sig.slice(0, -1)}${sig.at(-1) === "A" ? "B" : "A"}`, S, now), null, "tampered mac");
for (const bad of ["", "x", `${a}.${exp}`, `${t}.extra`, `nope.${exp}.${sig}`, `${a}.12.${sig}`, `${a}.${exp}.`])
  assert.equal(verifyToken(bad, S, now), null, `malformed: ${bad}`);
console.log("check-session: 14 ok");
