import { KinMandateAbi } from "@/lib/abi";
import { addr, publicClient } from "@/lib/chain";
import { submit } from "@/lib/server/relayer";

// Daily job (vercel.json cron): collect every AutoPay payment that has fallen due, so payees
// are paid automatically. `collect` is permissionless and pays the payee, so the relayer can call it.
// ponytail: scans the newest 500 mandates and collects ≤10 per run; shard or index if usage outgrows that.
const SCAN = 500n;
const MAX_COLLECTS = 10;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });

  const count = await publicClient.readContract({ address: addr.mandate, abi: KinMandateAbi, functionName: "count" });
  const ids: bigint[] = [];
  for (let i = count; i >= 1n && count - i < SCAN; i--) ids.push(i);
  const due = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: addr.mandate, abi: KinMandateAbi, functionName: "due", args: [id] }) as const),
  });

  const collected: string[] = [];
  for (let i = 0; i < ids.length && collected.length < MAX_COLLECTS; i++) {
    const r = due[i];
    if (r.status !== "success" || !r.result) continue;
    try {
      await submit({ address: addr.mandate, abi: KinMandateAbi, functionName: "collect", args: [ids[i]] }, 400_000n);
      collected.push(ids[i].toString());
    } catch (e) {
      console.error("autopay collect failed", ids[i], (e as Error).message?.slice(0, 200));
    }
  }
  return Response.json({ scanned: ids.length, collected });
}
