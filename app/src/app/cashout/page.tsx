"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AmountInput, useSignedIn } from "@/components/social/bits";
import { Button, Card, Chip, Delivered, ErrorText, Field, Screen, Tabs, inputClass } from "@/components/ui";
import { getBalance } from "@/lib/activity";
import { cashOut, inr, quote, UPI_RE, type Quote } from "@/lib/cashout";
import { humanError } from "@/lib/errors";
import { useMode } from "@/lib/mode";
import { formatMoney, fromLocal } from "@/lib/money";
import Offramp from "./Offramp";

// Two ways out: Agora (practice cash-out at Agora's fixed price) and Onramp (exchange route + money-flow view).
export default function CashOut() {
  const [tab, setTab] = useState<"agora" | "onramp">("agora");
  return (
    <Screen title="Cash out to UPI" back="/money">
      <Tabs value={tab} options={[["agora", "Agora"], ["onramp", "Onramp"]] as const} onChange={setTab} />
      {tab === "agora" ? <AgoraPractice /> : <Offramp />}
    </Screen>
  );
}

// Amount → UPI ID → live quote (Agora fixed price) → Identity check → settled. Practice money only for now.
function AgoraPractice() {
  const me = useSignedIn()?.address;
  const mode = useMode();
  const [amount, setAmount] = useState("");
  const [upi, setUpi] = useState("");
  const [q, setQ] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ hash: string; q: Quote; upi: string } | null>(null);

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const upiOk = UPI_RE.test(upi.trim());

  // Re-quote as the amount changes (debounced); the quote is the live fixed price on Agora's settlement pair.
  useEffect(() => {
    if (units === 0n || mode === "main") return;
    let live = true;
    const t = setTimeout(() => quote(units).then((x) => live && setQ(x), () => live && setQ(null)), 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [units, mode]);
  const shown = q && q.units === units ? q : null;

  async function submit() {
    if (!me || !shown) return;
    setBusy(true);
    setErr("");
    try {
      if ((await getBalance(me)) < shown.units) throw new Error("insufficient balance");
      const hash = await cashOut(shown, upi, me);
      setDone({ hash, q: shown, upi: upi.trim() });
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <Delivered title={`${inr(done.q.inr)} on its way`} subtitle={`To ${done.upi} · usually within minutes`}>
          <Card className="flex flex-col gap-2 text-left text-sm">
            <Chip tone="warn">Practice cash-out</Chip>
            <p className="text-muted">
              Your {formatMoney(done.q.units, "USD")} was settled at a fixed price through Agora. No real rupees move with practice money.
            </p>
          </Card>
          <Link href={`/details?tx=${done.hash}`} className="mt-4 block text-center text-sm font-semibold text-brand">Proof of payment</Link>
        </Delivered>
      </>
    );
  }

  return (
    <>
      {mode === "main" ? (
        <Card className="flex flex-col gap-2">
          <Chip tone="warn">Coming soon</Chip>
          <p className="text-sm text-muted">
            Cashing out real money to Indian bank accounts is coming soon. Turn off Real money in Me to try a practice cash-out.
          </p>
        </Card>
      ) : (
        <>
          <AmountInput label="How much?" value={amount} onChange={(v) => (setAmount(v), setErr(""))} />

          <Field label="Your UPI ID" hint={upi && !upiOk ? "Looks like name@bank" : undefined}>
            <input className={inputClass} placeholder="name@okbank" value={upi} onChange={(e) => (setUpi(e.target.value), setErr(""))}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" maxLength={100} />
          </Field>

          {shown && (
            <Card className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">You get</span>
                <span className="font-display text-2xl">{inr(shown.inr)}</span>
              </div>
              <Row k={`${formatMoney(shown.units, "USD")} at ${inr(shown.rate)} / $1`} v={inr(shown.gross)} />
              <Row k="Payout fee" v={`− ${inr(shown.fee)}`} />
              <Row k="Tax deducted (TDS 1%)" v={`− ${inr(shown.tds)}`} />
              <p className="pt-1 text-xs text-muted">Settled at a fixed price through Agora · Practice money</p>
            </Card>
          )}

          <ErrorText>{err}</ErrorText>
          <div className="mt-auto pt-2">
            <Button onClick={submit} busy={busy} disabled={!shown || !upiOk || shown.inr <= 0}>
              {shown ? `Cash out ${inr(shown.inr)}` : "Cash out"}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{k}</span>
      <span className="tabular">{v}</span>
    </div>
  );
}
