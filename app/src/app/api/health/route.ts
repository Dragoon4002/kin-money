import { formatEther, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { publicClient } from "@/lib/chain";
import { allow, clientIp } from "@/lib/server/relayer";

// Public health check for uptime monitors (Tenderly, UptimeRobot…): is the account that pays everyone's gas funded?
// 200 = ok, 503 = low/critical/unreachable, so a basic "alert on non-200" monitor catches it before sends start failing.
// The balance is public onchain anyway. Monad docs: relayers sending many transactions should keep > 10 MON.
const LOW_MON = 10;
const CRITICAL_MON = 1;

export async function GET(req: Request) {
  if (!allow(`health:${clientIp(req)}`, 30)) return Response.json({ error: "slow down" }, { status: 429 });
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) return Response.json({ status: "unconfigured" }, { status: 503 });
  const headers = { "cache-control": "no-store" };
  try {
    const mon = Number(formatEther(await publicClient.getBalance({ address: privateKeyToAddress(key as Hex) })));
    const status = mon < CRITICAL_MON ? "critical" : mon < LOW_MON ? "low" : "ok";
    return Response.json({ status, relayerMon: Math.round(mon * 100) / 100 }, { status: status === "ok" ? 200 : 503, headers });
  } catch {
    return Response.json({ status: "unreachable" }, { status: 503, headers });
  }
}
