"use client";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { Address } from "viem";
import { MarkDone, PartChip } from "@/components/invoice/parts";
import { Loading, Status, Who, WhoAvatar, dateLabel, timeLeft, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { Amount, Button, Card, Chip, ErrorText, Ico, Screen } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { api, recordPayment } from "@/lib/contacts";
import type { Invoice as Meta } from "@/lib/invoiceMeta";
import { formatMoney } from "@/lib/money";
import { canRelease, getEscrow, same, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";

// /invoice/12-13-14 — one held payment per part. Names/dues/"done" from /api/invoices (older links: ?t=Logo).

export default function Page() {
  return (
    <Suspense fallback={<Screen title="Invoice"><Loading /></Screen>}>
      <Invoice />
    </Suspense>
  );
}

function Invoice() {
  const { id } = useParams<{ id: string }>();
  const title = useSearchParams().get("t")?.slice(0, 60);
  const me = useMe();
  const ids = id.split("-").filter((x) => /^\d+$/.test(x)).slice(0, 3).map(BigInt);
  const { data, error, reload } = useLoad(() => Promise.all(ids.map(getEscrow)), id);
  const { data: inv, reload: reloadInv } = useLoad(() => api<Meta | null>(`/api/invoices?e=${ids[0]}`).catch(() => null), me && ids.length ? `${id}-${me}` : undefined);

  if (!data) return <Screen title="Invoice" back="/invoice">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const first = data[0];
  if (!first || data.some((e) => e.kind !== "invoice")) {
    return <Screen title="Invoice" back="/invoice"><ErrorText>We couldn&apos;t find this invoice.</ErrorText></Screen>;
  }
  const paid = data.filter((e) => e.settled).reduce((a, e) => a + e.amount, 0n);
  const total = data.reduce((a, e) => a + e.amount, 0n);
  const iWork = same(first.to, me);

  return (
    <Screen title={inv?.title || title || "Invoice"} back="/invoice">
      <Card className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex -space-x-3">
          <WhoAvatar a={first.from} size={48} />
          <WhoAvatar a={first.to} size={48} />
        </div>
        <p className="text-sm text-muted">
          <Who a={first.from} me={me} /> → <Who a={first.to} me={me} you="you" />
        </p>
        <Amount value={formatMoney(total)} size="xl" />
        {paid === total ? <Chip tone="good">All paid ✓✓</Chip> : <Chip>{formatMoney(paid)} paid so far</Chip>}
      </Card>
      {data.map((e, i) => {
        const n = inv?.escrows.indexOf(String(e.id)) ?? -1;
        const meta = n >= 0 ? { inv: inv!, n } : undefined;
        return <Part key={String(e.id)} e={e} n={i + 1} many={data.length > 1} me={me} iWork={iWork} meta={meta} onDone={() => { reload(); reloadInv(); }} />;
      })}
    </Screen>
  );
}

function Part({ e, n, many, me, iWork, meta, onDone }: { e: Escrow; n: number; many: boolean; me?: Address; iWork: boolean; meta?: { inv: Meta; n: number }; onDone: () => void }) {
  const p = meta?.inv.parts[meta.n];
  const now = useNow();
  const { busy, status, error, run } = useAction();
  const iPay = same(e.approver, me) && !e.settled;
  const due = canRelease(e, now);

  async function act(fn: "approve" | "release") {
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, fn, [e.id]);
      say("Paying…");
      return true;
    });
    if (ok) {
      if (fn === "approve") void recordPayment(e.to, e.amount);
      onDone();
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="min-w-0 truncate font-semibold">{p?.name ?? (many ? `Part ${n}` : "Payment")}</p>
        <p className="font-display text-3xl tabular">{formatMoney(e.amount)}</p>
      </div>
      {p && <p><PartChip p={p} settled={e.settled} iWork={iWork} /></p>}
      {e.settled ? (
        !p && <p><Chip tone="good">Paid ✓✓</Chip></p>
      ) : due ? (
        <p className="text-sm text-muted">No reply in time — ready to pay out.</p>
      ) : (
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-muted"><Ico name="safe" size={16} /> Held safely</span>
          <span className="font-medium tabular">Pays itself in {timeLeft(e.autoApproveAt - now)}</span>
        </div>
      )}
      {!e.settled && !due && <p className="text-xs text-muted">On {dateLabel(e.autoApproveAt)}, unless it&apos;s OK&apos;d sooner.</p>}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {meta && p && iWork && !p.done && !e.settled && <MarkDone id={meta.inv.id} n={meta.n} onDone={onDone} />}
      {iPay && !due && <Button onClick={() => act("approve")} busy={busy}>Work looks good — pay</Button>}
      {due && !e.settled && (
        <Button variant={iWork ? "primary" : "soft"} onClick={() => act("release")} busy={busy}>
          {iWork ? `Collect ${formatMoney(e.amount)}` : "Pay out now"}
        </Button>
      )}
    </Card>
  );
}
