// Pure checks for src/lib.ts: node --experimental-strip-types test/handlers.test.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeEventLog } from "viem";
import { ABIS, ADDRESSES, activityRows, involved, keepTransfer } from "../src/lib.ts";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";
const tx = "0x" + "ab".repeat(32);
const at = { blockNumber: 67_200_000, timestamp: 1_760_000_000, txHash: tx, logIndex: 4 };

// AUSD transfer between two strangers is skipped; Kin account or Kin contract on either side keeps it.
assert.equal(keepTransfer(A, B, false), false);
assert.equal(keepTransfer(A, B, true), true);
assert.equal(keepTransfer(A, ADDRESSES.KinEscrow.toUpperCase().replace("0X", "0x"), false), true);

// Involved-account rows: a transfer produces a row for both sides, each pointing at the other.
const t = activityRows({ contract: "AUSD", event: "Transfer", address: ADDRESSES.AUSD, params: { from: A, to: B, value: 5_000_000n }, ...at });
assert.deepEqual(t.map((r) => [r.account, r.counterparty]), [[A, B], [B, A]]);
assert.equal(t[0].kind, "transfer");
assert.equal(t[0].amount, 5_000_000n);
assert.equal(t[0].id, `${tx}-4-${A}`);
assert.notEqual(t[0].id, t[1].id);

// Raw topics/data rebuilt from decoded params decode back to the same args (incl. address[]).
const params = { id: 7n, creator: A, beneficiaries: [B], toAll: false, target: 100n, members: [A, B, C] };
const pot = activityRows({ contract: "KinPot", event: "PotCreated", address: ADDRESSES.KinPot, params, ...at });
assert.equal(pot.length, 3);
assert.ok(pot.every((r) => r.counterparty === undefined && r.kind === "pot"));
const back = decodeEventLog({ abi: ABIS.KinPot, topics: JSON.parse(pot[0].topics), data: pot[0].rawData as `0x${string}` });
assert.equal(back.eventName, "PotCreated");
assert.deepEqual(JSON.parse(pot[0].data), { id: "7", creator: A, beneficiaries: [B], toAll: false, target: "100", members: [A, B, C] });
assert.equal((back.args as unknown as { members: string[] }).members.length, 3);

// Invite key is not a person; events naming nobody still get one row (keyed by contract) so no log is lost.
assert.deepEqual(involved({ id: 1n, member: A, key: B }), [A]);
const none = activityRows({ contract: "KinCircle", event: "Started", address: ADDRESSES.KinCircle, params: { id: 1n, roundStart: 5n }, ...at });
assert.deepEqual(none.map((r) => r.account), [ADDRESSES.KinCircle]);

// Hardcoded addresses mirror config.yaml.
const cfg = readFileSync(new URL("../config.yaml", import.meta.url), "utf8").toLowerCase();
for (const a of Object.values(ADDRESSES)) assert.ok(cfg.includes(a), a);

console.log("handlers.test: ok");
