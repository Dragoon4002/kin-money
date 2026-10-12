import { parseAbi, stringToHex, type Address } from "viem";
import { publicClient } from "@/lib/chain";
import { FX_STATIC } from "@/lib/money";

// Live USD→local rates, written onchain every 10 min by the Chainlink CRE "Kin Orchestrator" workflow
// (cre/kin-orchestrator: 3 FX APIs → median → node consensus → KinKeeper on Monad testnet).
// ponytail: testnet KinKeeper address inline; move to env if it's ever redeployed per network.
const KEEPER = (process.env.KIN_KEEPER ?? "0x6096983BDD0101B82384CC6368F27C08e91e4212") as Address;
const abi = parseAbi(["function rateOf(bytes3 code) view returns (uint64 value, uint40 updatedAt)"]);
const STALE = 24 * 3600; // older than a day → app keeps its built-in table

export async function GET() {
  const codes = Object.keys(FX_STATIC).filter((c) => c !== "USD");
  const res = await publicClient
    .multicall({ contracts: codes.map((c) => ({ address: KEEPER, abi, functionName: "rateOf", args: [stringToHex(c, { size: 3 })] }) as const) })
    .catch(() => []);
  const now = Math.floor(Date.now() / 1000);
  const rates: Record<string, number> = {};
  let updatedAt = 0;
  res.forEach((r, i) => {
    if (r.status !== "success") return;
    const [value, at] = r.result;
    const rate = Number(value) / 1e6;
    const base = FX_STATIC[codes[i]];
    // Testnet mock forwarder accepts anyone's report: only trust rates near the built-in table.
    if (now - at > STALE || rate < base * 0.75 || rate > base * 1.25) return;
    rates[codes[i]] = rate;
    updatedAt = Math.max(updatedAt, at);
  });
  return Response.json({ rates, updatedAt }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
