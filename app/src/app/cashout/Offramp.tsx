"use client";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, type Address, type Hex } from "viem";
import { AmountInput, useSignedIn } from "@/components/social/bits";
import { Button, Card, Chip, ErrorText, Tabs } from "@/components/ui";
import { networks, type Mode } from "@/lib/chain";
import { inr, payoutFee, TDS } from "@/lib/cashout";
import { ROUTES, type Venue } from "@/lib/cashoutRoutes";
import { humanError } from "@/lib/errors";
import { useMode } from "@/lib/mode";
import { FX, fromLocal } from "@/lib/money";
import { cashOutVia, quoteVia, venueStatus, type Hop, type VenueStatus } from "@/lib/offramp";
import { onrampQuote, type OnrampQuote } from "@/lib/onrampWidget";

// Onramp route: dollars → exchange (Agora or Uniswap) → back into your account → Onramp → rupees to your bank.
// Leg 2 (Onramp white-label, server-to-server): Onramp's quote for the exchanged amount. Practice money = Onramp's
// sandbox, no rupees move. The order + deposit (createTransaction → payOut) switches on once Onramp enables our app. "Where your money goes"
// shows every hop, planned before and real (from the receipts) after.

const VENUE_NAME: Record<Venue, string> = { agora: "Agora settlement", uniswap: "Uniswap pool" };

type Done = { hash: Hex; hops: Hop[]; payout: "sent" | "off" | "sandbox"; rupees?: number; quote?: OnrampQuote };

export default function Offramp() {
  const me = useSignedIn()?.address as Address | undefined;
  const mode = useMode();
  const [net, setNet] = useState<Mode>(mode);
  const [st, setSt] = useState<{ net: Mode; s: Record<Venue, VenueStatus> } | null>(null);
  const [venue, setVenue] = useState<Venue>("uniswap");
  const [amount, setAmount] = useState("");
  const [out, setOut] = useState<{ units: bigint; out: bigint; net: Mode; venue: Venue } | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  const r = ROUTES[net];
  const status = st?.net === net ? st.s : null;
  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;

  useEffect(() => {
    let live = true;
    venueStatus(net).then((s) => {
      if (!live) return;
      setSt({ net, s });
      setVenue((v) => (s[v].ok ? v : s.uniswap.ok ? "uniswap" : "agora"));
    });
    if (me) networks[net].client.readContract({ address: networks[net].ausd, abi: erc20Abi, functionName: "balanceOf", args: [me] }).then((b) => live && setBalance(b), () => {});
    return () => {
      live = false;
    };
  }, [net, me, done]);

  useEffect(() => {
    if (units === 0n || !status?.[venue].ok) return;
    let live = true;
    const t = setTimeout(() => quoteVia(net, venue, units).then((o) => live && setOut({ units, out: o, net, venue }), () => live && setOut(null)), 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [units, net, venue, status]);
  const shown = out && out.units === units && out.net === net && out.venue === venue && status?.[venue].ok ? out : null;

  const settled = shown ? Number(formatUnits(shown.out, r.settle.decimals)) : 0;
  const gross = settled * FX.INR;
  const rupees = Math.max(0, gross - payoutFee(gross) - Math.round(gross * TDS * 100) / 100);
  const dollars = (u: bigint) => `$${formatUnits(u, 6)}`;

  async function submit() {
    if (!me || !shown) return;
    setBusy(true);
    setErr("");
    try {
      if (balance !== null && balance < shown.units) throw new Error("insufficient balance");
      const l1 = await cashOutVia(net, venue, shown.units, shown.out, "onramp");
      const quote = await onrampQuote(formatUnits(l1.received, r.settle.decimals).replace(/(\.\d{6})\d+$/, "$1")).catch(() => undefined);
      setDone({ ...l1, payout: net === "main" ? "off" : "sandbox", rupees: quote?.rupees, quote });
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  const planned: Hop[] = shown
    ? [
        { from: "You", to: "Kin cash-out", amount: `${dollars(shown.units)} AUSD` },
        { from: "Kin cash-out", to: VENUE_NAME[venue], amount: `${dollars(shown.units)} AUSD` },
        { from: VENUE_NAME[venue], to: "You", amount: `≈ ${settled.toFixed(r.settle.decimals === 6 ? 6 : 4)} ${r.settle.symbol}` },
      ]
    : [];
  const hops = done?.hops ?? planned;
  const payoutNote = { sent: "on its way", off: "not sent · money is in your account", sandbox: "Onramp sandbox · no rupees move" };

  return (
    <>
      <Card className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={net} options={[["test", "Practice"], ["main", "Real"]] as const} onChange={(v) => (setNet(v), setDone(null), setErr(""))} />
          <Tabs value={venue} options={[["uniswap", "Uniswap"], ["agora", "Agora"]] as const} onChange={(v) => (setVenue(v), setDone(null))} />
        </div>
        {status && !status[venue].ok && <p className="text-xs text-bad">{status[venue].why}</p>}
        {balance !== null && <p className="text-xs text-muted">Balance: {dollars(balance)}</p>}
      </Card>

      {!done && (
        <>
          <AmountInput label="How much?" value={amount} onChange={(v) => (setAmount(v), setErr(""))} />
          <p className="text-xs text-muted">Rupees are paid by Onramp to your bank, verified once with Onramp.</p>
        </>
      )}

      {hops.length > 0 && (
        <Card className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Where your money goes {done ? "" : "(planned)"}</span>
            {done && <Chip tone={done.payout === "sent" ? "good" : "muted"}>{done.payout === "sent" ? "Done" : "Exchanged"}</Chip>}
          </div>
          <ol className="flex flex-col gap-2">
            {hops.map((h, i) => (
              <li key={i} className="flex items-start justify-between gap-3">
                <span>
                  {i + 1}. {h.from} → {h.to}
                </span>
                <span className="tabular shrink-0 text-right text-muted">{h.amount}</span>
              </li>
            ))}
            <li className="flex items-start justify-between gap-3 text-muted">
              <span>
                {hops.length + 1}. Onramp → your bank
              </span>
              <span className="shrink-0 text-right">{done?.rupees ? inr(done.rupees) : `≈ ${inr(rupees)}`}{done ? ` · ${payoutNote[done.payout]}` : ""}</span>
            </li>
          </ol>
          {done?.quote && (
            <div className="flex flex-col gap-1 border-t border-line pt-2 text-xs text-muted">
              <span className="font-semibold text-ink">Onramp quote {done.quote.sandbox ? "(sandbox)" : ""}</span>
              <span>Rate ₹{done.quote.rate.toFixed(2)} per dollar · Onramp fee ₹{done.quote.fees.onramp.toFixed(2)} · Bank fee ₹{done.quote.fees.gateway.toFixed(2)} · Tax (TDS 1%) ₹{done.quote.fees.tds.toFixed(2)}</span>
            </div>
          )}
          {done && (
            <a href={`${networks[net].explorer}/tx/${done.hash}`} target="_blank" rel="noreferrer" className="pt-1 text-sm font-semibold text-brand">
              Proof of payment ↗
            </a>
          )}
        </Card>
      )}

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        {done ? (
          <Button variant="soft" onClick={() => (setDone(null), setAmount(""))}>Try again</Button>
        ) : (
          <Button onClick={submit} busy={busy} disabled={!shown}>
            {shown ? `Cash out ${dollars(shown.units)}` : "Cash out"}
          </Button>
        )}
      </div>
    </>
  );
}
