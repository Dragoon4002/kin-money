import { erc20Abi, isAddress, parseAbi } from "viem";
import { addr, publicClient } from "@/lib/chain";
import { toUnits } from "@/lib/money";
import { allowShared } from "@/lib/server/graph";
import { allow, clientIp, once, submit } from "@/lib/server/relayer";

// Testnet only: gift new accounts test dollars via Agora's faucet (relayer pays gas).
const FAUCET = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const faucetAbi = parseAbi(["function requestFunds(address recipient)"]);

export async function POST(req: Request) {
  const { address } = await req.json().catch(() => ({}));
  if (!isAddress(address)) return Response.json({ error: "invalid" }, { status: 400 });
  if (!allow(`faucet:${clientIp(req)}`, 3, 3_600_000)) return Response.json({ error: "slow down" }, { status: 429 });
  if (!(await allowShared(`faucet:${clientIp(req)}`, 20, 86_400_000))) return Response.json({ error: "slow down" }, { status: 429 });
  const bal = await publicClient.readContract({ address: addr.ausd, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  if (bal >= toUnits(100) || !once(`faucet:${address.toLowerCase()}`) || !(await allowShared(`faucet-to:${address.toLowerCase()}`, 2, 7 * 86_400_000)))
    return Response.json({ skipped: true });
  try {
    const hash = await submit({ address: FAUCET, abi: faucetAbi, functionName: "requestFunds", args: [address] }, 250_000n);
    return Response.json({ hash }); // client waits for receipt, not the queue
  } catch (e) {
    console.error("faucet failed", (e as Error).message?.slice(0, 300));
    return Response.json({ error: "faucet unavailable" }, { status: 503 });
  }
}
