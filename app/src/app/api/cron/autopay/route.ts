import { zeroAddress } from "viem";
import { KinGiftLinkAbi, KinMandateAbi } from "@/lib/abi";
import { addr, publicClient } from "@/lib/chain";
import { submit } from "@/lib/server/relayer";

// Daily job (vercel.json cron): collect every AutoPay payment that has fallen due, and open every accepted
// gift link whose day has come. `collect`/`open` are permissionless and pay the payee, so the relayer can call them.
// ponytail: scans the newest 500 of each and sends ≤10 of each per run; shard or index if usage outgrows that.
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
  return Response.json({ scanned: ids.length, collected, opened: await openGifts() });
}

async function openGifts(): Promise<string[]> {
  const count = await publicClient.readContract({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "count" });
  const ids: bigint[] = [];
  for (let i = count; i >= 1n && count - i < SCAN; i--) ids.push(i);
  const gifts = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "gifts", args: [id] }) as const),
  });
  const now = Math.floor(Date.now() / 1000);
  const opened: string[] = [];
  for (let i = 0; i < ids.length && opened.length < MAX_COLLECTS; i++) {
    const r = gifts[i];
    if (r.status !== "success") continue;
    const [, unlockAt, , settled, recipient] = r.result;
    if (settled || recipient === zeroAddress || now < unlockAt) continue;
    try {
      await submit({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "open", args: [ids[i]] }, 400_000n);
      opened.push(ids[i].toString());
    } catch (e) {
      console.error("gift open failed", ids[i], (e as Error).message?.slice(0, 200));
    }
  }
  return opened;
}
