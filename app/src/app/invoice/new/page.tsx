"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { isAddress } from "viem";
import Link from "next/link";
import { Loading, Status, Who, WhoAvatar, useAction, useLoad } from "@/components/programs/kit";
import { useAccount } from "@/lib/account";
import { Amount, Button, Card, ErrorText, Ico, Screen } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney } from "@/lib/money";
import { resolveName } from "@/lib/names";
import { createdId, expiryAfter, nowSec, same, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";

// Client side of a pay link: /invoice/new?to=<handle>&m=<units,units>&d=<days>&t=<title>

export default function Page() {
  return (
    <Suspense fallback={<Screen title="Invoice"><Loading /></Screen>}>
      <PayInvoice />
    </Suspense>
  );
}

function PayInvoice() {
  const q = useSearchParams();
  const router = useRouter();
  // No redirect: a new client must see the invoice first, then join.
  const me = useAccount().profile?.address;
  const to = q.get("to") ?? "";
  const title = (q.get("t") ?? "").slice(0, 60);
  const days = Math.min(60, Math.max(1, Number(q.get("d")) || 7));
  const parts = (q.get("m") ?? "").split(",").slice(0, 3).map((x) => (/^\d{1,15}$/.test(x) ? BigInt(x) : 0n));
  const valid = parts.length > 0 && parts.every((p) => p > 0n);
  const total = parts.reduce((a, b) => a + b, 0n);

  const { data: payee, error: lookupError } = useLoad(async () => (isAddress(to) ? to : await resolveName(to)) ?? ZERO, to || undefined);
  const [held, setHeld] = useState<bigint[]>([]);
  const { busy, status, error, run } = useAction();

  async function pay() {
    if (!me || !payee || payee === ZERO) return;
    const autoAt = nowSec() + days * 86_400;
    const ids = [...held];
    await run(async (say) => {
      for (let i = ids.length; i < parts.length; i++) {
        if (parts.length > 1) say(`Holding part ${i + 1} of ${parts.length}…`);
        const hash = await call(addr.escrow, KinEscrowAbi, "create", [payee, ZERO, me, 0, expiryAfter(autoAt), autoAt], { fund: parts[i] });
        ids.push(await createdId(hash, KinEscrowAbi, "Created"));
        setHeld([...ids]);
      }
      void recordPayment(payee, total);
      router.replace(`/invoice/${ids.join("-")}?t=${encodeURIComponent(title)}`);
    });
  }

  if (!valid || !to) return <Screen title="Invoice" back="/home"><ErrorText>This pay link looks broken. Ask for a new one.</ErrorText></Screen>;
  if (payee === undefined && !lookupError) return <Screen title="Invoice"><Loading /></Screen>;
  if (!payee || payee === ZERO) return <Screen title="Invoice" back="/home"><ErrorText>No one on Kin with that name yet.</ErrorText></Screen>;
  const self = same(payee, me);

  return (
    <Screen title="Invoice" back="/home">
      <Card className="flex flex-col items-center gap-2 py-7 text-center">
        <WhoAvatar a={payee} size={56} />
        <p className="text-sm text-muted"><Who a={payee} me={me} /> asks for</p>
        <Amount value={formatMoney(total)} size="xl" />
        {title && <p className="font-semibold">“{title}”</p>}
      </Card>
      {parts.length > 1 && (
        <ol className="flex flex-col gap-2">
          {parts.map((p, i) => (
            <li key={i} className="flex h-14 items-center justify-between rounded-full border border-line bg-surface px-5">
              <span className="flex items-center gap-2">
                {i < held.length ? <Ico name="check" size={16} className="text-good" /> : <span className="text-muted">{i + 1}</span>} Part {i + 1}
              </span>
              <span className="font-display text-xl tabular">{formatMoney(p)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="flex gap-2 text-sm text-muted">
        <Ico name="safe" size={18} className="mt-0.5 shrink-0" />
        Your money is held safely. It reaches them only when you OK the work — or automatically {days} days after you pay if you don&apos;t reply.
      </p>
      <ErrorText>{self ? "This is your own invoice — send the link to your client." : error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        {me ? (
          <Button onClick={pay} busy={busy} disabled={self}>
            {held.length ? "Hold the rest" : `Pay ${formatMoney(total)}`}
          </Button>
        ) : (
          <Link href={`/?next=${encodeURIComponent(`/invoice/new?${q}`)}`} className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink">
            Join Kin to pay
          </Link>
        )}
      </div>
    </Screen>
  );
}
