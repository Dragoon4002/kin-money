// Fetch real Kin logs from Envio HyperSync and run src/lib.ts over them; proves decoding + exact raw rebuild.
// ENVIO_API_TOKEN from env or ../app/.env.local (never printed). node --experimental-strip-types test/real-slice.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeEventLog, type Hex } from "viem";
import { ABIS, ADDRESSES, activityRows, keepTransfer, type ContractName } from "../src/lib.ts";

const token = process.env.ENVIO_API_TOKEN ?? readFileSync(new URL("../../app/.env.local", import.meta.url), "utf8").match(/^ENVIO_API_TOKEN="?([^"\n]+)/m)?.[1];
type HsLog = { block_number: number; log_index: number; transaction_hash: Hex; address: Hex; data: Hex; topic0?: Hex; topic1?: Hex; topic2?: Hex; topic3?: Hex };
async function query(body: object, tries = 5): Promise<(HsLog & { timestamp: number })[]> {
  const res = await fetch("https://10143.hypersync.xyz/query", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  if (res.status === 429 && tries > 1) return new Promise((r) => setTimeout(r, 3_000)).then(() => query(body, tries - 1));
  if (!res.ok) throw new Error(`hypersync ${res.status}`);
  const j = (await res.json()) as { data: { logs?: HsLog[]; blocks?: { number: number; timestamp: string }[] }[] };
  const times = new Map(j.data.flatMap((d) => d.blocks ?? []).map((b) => [b.number, Number(b.timestamp)]));
  return j.data.flatMap((d) => d.logs ?? []).map((l) => ({ ...l, timestamp: times.get(l.block_number) ?? 0 }));
}
const fields = { log: ["block_number", "log_index", "transaction_hash", "address", "data", "topic0", "topic1", "topic2", "topic3"], block: ["number", "timestamp"] };
const byAddr = new Map(Object.entries(ADDRESSES).map(([n, a]) => [a, n as ContractName]));
const kin = Object.values(ADDRESSES).filter((a) => a !== ADDRESSES.AUSD);

const kinLogs = await query({ from_block: 67_103_075, logs: [{ address: kin }], field_selection: fields });
assert.ok(kinLogs.length > 0, "no Kin logs found");
// AUSD Transfers in the blocks of the first 10 Kin txs (each Kin money move also moves AUSD).
const blocks = [...new Set(kinLogs.slice(0, 10).map((l) => l.block_number))];
const ausd: Awaited<ReturnType<typeof query>> = [];
for (const b of blocks) ausd.push(...(await query({ from_block: b, to_block: b + 1, logs: [{ address: [ADDRESSES.AUSD], topics: [["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]] }], field_selection: fields })));

const counts: Record<string, number> = {};
let rows = 0, kept = 0;
for (const l of [...kinLogs, ...ausd]) {
  const contract = byAddr.get(l.address.toLowerCase())!;
  const topics = [l.topic0, l.topic1, l.topic2, l.topic3].filter(Boolean) as [Hex, ...Hex[]];
  const { eventName, args } = decodeEventLog({ abi: ABIS[contract], topics, data: l.data });
  const params = args as unknown as Record<string, unknown>;
  // No account registry here: keep a transfer only if it touches a Kin contract (accounts add more in the real indexer).
  if (contract === "AUSD" && !keepTransfer(params.from as string, params.to as string, false)) continue;
  const r = activityRows({ contract, event: eventName!, address: l.address, params, blockNumber: l.block_number, timestamp: l.timestamp, txHash: l.transaction_hash, logIndex: l.log_index });
  assert.ok(r.length > 0);
  for (const x of r) {
    assert.deepEqual(JSON.parse(x.topics), topics, `topics ${contract}.${eventName} ${l.transaction_hash}`);
    assert.equal(x.rawData, l.data, `data ${contract}.${eventName} ${l.transaction_hash}`);
  }
  if (contract === "AUSD") kept++;
  rows += r.length;
  counts[`${contract}.${eventName}`] = (counts[`${contract}.${eventName}`] ?? 0) + 1;
}
console.log(`real-slice: ${kinLogs.length} Kin logs + ${ausd.length} AUSD transfers (${kept} kept) -> ${rows} rows, raw rebuild exact`);
console.log(counts);
