import { createHmac, timingSafeEqual } from "node:crypto";
import { numberToHex, type Hex, type RpcLog } from "viem";
import { ingest } from "@/lib/server/history";

// Alchemy Custom Webhook (Monad testnet): every AUSD Transfer, pushed the moment its block lands.
// Verified with the webhook's signing key, then handed to history.ingest → same dedupe + push as scanned logs.
// GraphQL: block { number hash logs(filter: {addresses: [AUSD], topics: [Transfer]}) { data topics index transaction { hash index status } } }

type AlchemyLog = { data: Hex; topics: Hex[]; index: number; transaction: { hash: Hex; index: number; status: number } };
type Payload = { webhookId?: string; event?: { data?: { block?: { number: number; hash: Hex; logs?: AlchemyLog[] } } } };

function signed(raw: string, sig: string | null): boolean {
  const key = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;
  if (!key || !sig) return false;
  const want = Buffer.from(createHmac("sha256", key).update(raw, "utf8").digest("hex"));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!signed(raw, req.headers.get("x-alchemy-signature"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = JSON.parse(raw) as Payload;
  const id = process.env.ALCHEMY_WEBHOOK_ID;
  if (id && body.webhookId && body.webhookId !== id) return Response.json({ ok: true, skipped: "other webhook" });

  const block = body.event?.data?.block;
  const logs: RpcLog[] = (block?.logs ?? [])
    .filter((l) => l.transaction?.status === 1)
    .map((l) => ({
      address: (process.env.NEXT_PUBLIC_AUSD ?? "").toLowerCase() as Hex,
      topics: l.topics as RpcLog["topics"],
      data: l.data,
      blockHash: block!.hash,
      blockNumber: numberToHex(block!.number),
      transactionHash: l.transaction.hash,
      transactionIndex: numberToHex(l.transaction.index),
      logIndex: numberToHex(l.index),
      removed: false,
    }));
  if (logs.length) await ingest(logs);
  return Response.json({ ok: true, logs: logs.length });
}
