"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import Link from "next/link";
import { fetchInvoice, MarkDone, PartChip, SendSheet } from "@/components/invoice/parts";
import { Loading, Status, Who, WhoAvatar, useAction, useLoad } from "@/components/programs/kit";
import { useAccount } from "@/lib/account";
import { Amount, Button, Card, ErrorText, Ico, Screen } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { api, recordPayment } from "@/lib/contacts";
import { partsTotal, type Invoice, type Part } from "@/lib/invoiceMeta";
import { formatMoney } from "@/lib/money";
import { resolveName } from "@/lib/names";
import { createdId, expiryAfter, nowSec, same, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";

// Pay link: /invoice/new?i=<invoice id> (parts saved server-side, see /api/invoices).
// Older links still work: /invoice/new?to=<handle>&m=<units,units>&d=<days>&t=<title>

export default function Page() {
  return (
    <Suspense fallback={<Screen title="Invoice"><Loading /></Screen>}>
      <PayInvoice />
    </Suspense>
  );
}

const broken = <Screen title="Invoice" back="/home"><ErrorText>This pay link looks broken. Ask for a new one.</ErrorText></Screen>;

function PayInvoice() {
  const q = useSearchParams();
  const id = q.get("i");
  const { data: inv, error, reload } = useLoad(() => fetchInvoice(id!), id ?? undefined);

  if (id) {
    if (inv === undefined) return <Screen title="Invoice" back="/home">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
    if (!inv) return broken;
    return <Pay to={inv.owner} title={inv.title} days={inv.days} parts={inv.parts} inv={inv} reload={reload} here={`/invoice/new?${q}`} />;
  }
  const parts: Part[] = (q.get("m") ?? "").split(",").slice(0, 3).map((x, i) => ({ name: `Part ${i + 1}`, amount: /^[1-9]\d{0,14}$/.test(x) ? x : "", due: 0, done: false }));
  if (!q.get("to") || parts.some((p) => !p.amount)) return broken;
  return <Pay to={q.get("to")!} title={(q.get("t") ?? "").slice(0, 60)} days={Math.min(60, Math.max(1, Number(q.get("d")) || 7))} parts={parts} here={`/invoice/new?${q}`} />;
}

function Pay({ to, title, days, parts, inv, reload, here }: { to: string; title: string; days: number; parts: Part[]; inv?: Invoice; reload?: () => void; here: string }) {
  const router = useRouter();
  // No redirect: a new client must see the invoice first, then join.
  const me = useAccount().profile?.address;
  const total = partsTotal(parts);
  const { data: payee, error: lookupError } = useLoad(async () => (isAddress(to) ? to : await resolveName(to)) ?? ZERO, to);
  const [held, setHeld] = useState<bigint[]>([]);
  const [sending, setSending] = useState(false);
  const { busy, status, error, run } = useAction();
  const self = !!payee && same(payee, me);
  const paidBy = inv?.escrows.length ? (inv.payer as Address) : null;
  const goHeld = paidBy && me && (self || same(paidBy, me)) ? `/invoice/${inv!.escrows.join("-")}` : null;

  useEffect(() => {
    if (goHeld) router.replace(goHeld);
  }, [goHeld, router]);

  async function pay() {
    if (!me || !payee || payee === ZERO) return;
    const autoAt = nowSec() + days * 86_400;
    const ids = [...held];
    await run(async (say) => {
      for (let i = ids.length; i < parts.length; i++) {
        if (parts.length > 1) say(`Holding part ${i + 1} of ${parts.length}…`);
        const hash = await call(addr.escrow, KinEscrowAbi, "create", [payee, ZERO, me, 0, expiryAfter(autoAt), autoAt], { fund: BigInt(parts[i].amount) });
        ids.push(await createdId(hash, KinEscrowAbi, "Created"));
        setHeld([...ids]);
      }
      void recordPayment(payee, total);
      // Link the held money to the invoice so both phones see part names and "done". Money is already safe if this fails.
      if (inv) await api("/api/invoices", "POST", { action: "held", id: inv.id, escrows: ids.map(String) }).catch(() => {});
      router.replace(`/invoice/${ids.join("-")}${inv ? "" : `?t=${encodeURIComponent(title)}`}`);
    });
  }

  if (payee === undefined && !lookupError) return <Screen title="Invoice"><Loading /></Screen>;
  if (!payee || payee === ZERO) return <Screen title="Invoice" back="/home"><ErrorText>No one on Kin with that name yet.</ErrorText></Screen>;
  if (goHeld) return <Screen title="Invoice"><Loading /></Screen>;
  if (paidBy) return <Screen title="Invoice" back="/home"><ErrorText>This invoice is already paid.</ErrorText></Screen>;
  const owner = self && !!inv;

  return (
    <Screen title={owner ? title : "Invoice"} back={owner ? "/invoice" : "/home"}>
      <Card className="flex flex-col items-center gap-2 py-7 text-center">
        <WhoAvatar a={payee} size={56} />
        <p className="text-sm text-muted"><Who a={payee} me={me} /> {self ? "ask" : "asks"} for</p>
        <Amount value={formatMoney(total)} size="xl" />
        {title && <p className="font-semibold">‘{title}’</p>}
      </Card>
      {(parts.length > 1 || inv) && (
        <ol className="flex flex-col gap-2">
          {parts.map((p, i) => (
            <li key={i} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {i < held.length ? <Ico name="check" size={16} className="shrink-0 text-good" /> : <span className="text-muted">{i + 1}</span>}
                  <span className="truncate font-semibold">{p.name}</span>
                </span>
                <span className="font-display text-xl tabular">{formatMoney(BigInt(p.amount))}</span>
              </div>
              {inv && <span><PartChip p={p} settled={false} iWork={self} /></span>}
              {owner && !p.done && <MarkDone id={inv.id} n={i} onDone={() => reload?.()} />}
            </li>
          ))}
        </ol>
      )}
      {owner ? (
        <p className="text-sm text-muted">Send this to your client. Mark each part done as you finish — they&apos;ll get a nudge to pay it.</p>
      ) : (
        <p className="flex gap-2 text-sm text-muted">
          <Ico name="safe" size={18} className="mt-0.5 shrink-0" />
          Your money is held safely. It reaches them only when you OK the work — or automatically {days} days after you pay if you don&apos;t reply.
        </p>
      )}
      <ErrorText>{self && !inv ? "This is your own invoice — send the link to your client." : error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        {owner ? (
          <Button onClick={() => setSending(true)}>Send invoice</Button>
        ) : me ? (
          <Button onClick={pay} busy={busy} disabled={self}>
            {held.length ? "Hold the rest" : `Pay ${formatMoney(total)}`}
          </Button>
        ) : (
          <Link href={`/?next=${encodeURIComponent(here)}`} className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink">
            Join Kin to pay
          </Link>
        )}
      </div>
      {owner && <SendSheet inv={inv} open={sending} onClose={() => setSending(false)} />}
    </Screen>
  );
}
