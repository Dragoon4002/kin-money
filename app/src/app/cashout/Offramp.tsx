"use client";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, isAddress, type Address, type Hex } from "viem";
import { AmountInput, useSignedIn } from "@/components/social/bits";
import { Button, Card, Chip, ErrorText, Field, Tabs, inputClass } from "@/components/ui";
import { networks, type Mode } from "@/lib/chain";
import { inr, payoutFee, TDS, UPI_RE } from "@/lib/cashout";
import { ROUTES, type Venue } from "@/lib/cashoutRoutes";
import { humanError } from "@/lib/errors";
import { useMode } from "@/lib/mode";
import { FX, fromLocal } from "@/lib/money";
import { cashOutVia, quoteVia, venueStatus, type Hop, type VenueStatus } from "@/lib/offramp";

// Onramp route: dollars → exchange (Agora or Uniswap) → payout account → Onramp → rupees to UPI.
// Test options pick the network, exchange and payout account; "Where your money goes" shows every hop,
// planned before and real (from the receipt) after. The Onramp leg isn't connected yet (needs Onramp keys).

const VENUE_NAME: Record<Venue, string> = { agora: "Agora settlement", uniswap: "Uniswap pool" };

export default function Offramp() {
  const me = useSignedIn()?.address as Address | undefined;
  const mode = useMode();
  const [net, setNet] = useState<Mode>(mode);
  const [st, setSt] = useState<{ net: Mode; s: Record<Venue, VenueStatus> } | null>(null);
  const [venue, setVenue] = useState<Venue>("uniswap");
  const [dest, setDest] = useState<"me" | "other">("me");
  const [other, setOther] = useState("");
  const [amount, setAmount] = useState("");
  const [upi, setUpi] = useState("");
  const [out, setOut] = useState<{ units: bigint; out: bigint; net: Mode; venue: Venue } | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ hash: Hex; hops: Hop[] } | null>(null);

  const r = ROUTES[net];
  const status = st?.net === net ? st.s : null;
  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const to = dest === "me" ? me : isAddress(other.trim()) ? (other.trim() as Address) : undefined;
  const upiOk = !upi || UPI_RE.test(upi.trim());

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
  const destName = dest === "me" ? "You" : to ? `${to.slice(0, 6)}…${to.slice(-4)}` : "Payout account";

  async function submit() {
    if (!me || !shown || !to) return;
    setBusy(true);
    setErr("");
    try {
      if (balance !== null && balance < shown.units) throw new Error("insufficient balance");
      setDone(await cashOutVia(net, venue, shown.units, shown.out, to, upi.trim()));
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
        { from: VENUE_NAME[venue], to: destName, amount: `≈ ${settled.toFixed(r.settle.decimals === 6 ? 6 : 4)} ${r.settle.symbol}` },
      ]
    : [];
  const hops = done?.hops ?? planned;

  return (
    <>
      <Card className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Test options</span>
          <Chip tone={net === "main" ? "warn" : "muted"}>{net === "main" ? "Real money" : "Practice money"}</Chip>
        </div>
        <Opt label="Network">
          <Tabs value={net} options={[["test", "Practice"], ["main", "Real"]] as const} onChange={(v) => (setNet(v), setDone(null), setErr(""))} />
        </Opt>
        <Opt label="Exchange">
          <Tabs value={venue} options={[["uniswap", "Uniswap"], ["agora", "Agora"]] as const} onChange={(v) => (setVenue(v), setDone(null))} />
          {status && !status[venue].ok && <p className="text-xs text-bad">{status[venue].why}</p>}
        </Opt>
        <Opt label="Send exchanged money to">
          <Tabs value={dest} options={[["me", "My account"], ["other", "Another account"]] as const} onChange={(v) => (setDest(v), setDone(null))} />
          {dest === "other" && (
            <>
              <input className={inputClass} placeholder="0x… payout account" value={other} onChange={(e) => setOther(e.target.value)}
                autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              <p className="text-xs text-muted">Paste an exchange&apos;s deposit account. Money sent there can&apos;t be pulled back — double-check it.</p>
            </>
          )}
        </Opt>
        <Opt label="Payout">
          <p className="text-xs text-muted">Onramp → rupees to UPI: not connected yet (needs Onramp keys and Monad selling turned on).</p>
        </Opt>
        {balance !== null && <p className="text-xs text-muted">Balance on this network: {dollars(balance)}</p>}
      </Card>

      {done ? (
        <Card className="flex flex-col gap-1 text-sm">
          <Chip tone="good">Done</Chip>
          <p className="text-muted">Exchanged and sent to {destName}. Rupee payout is the next step once Onramp is connected.</p>
        </Card>
      ) : (
        <>
          <AmountInput label="How much?" value={amount} onChange={(v) => (setAmount(v), setErr(""))} />
          <Field label="Your UPI ID (for the payout record)" hint={!upiOk ? "Looks like name@bank" : undefined}>
            <input className={inputClass} placeholder="name@okbank" value={upi} onChange={(e) => setUpi(e.target.value)}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" maxLength={100} />
          </Field>
        </>
      )}

      {hops.length > 0 && (
        <Card className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Where your money goes {done ? "" : "(planned)"}</span>
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
                {hops.length + 1}. {destName} → Onramp → your UPI
              </span>
              <span className="shrink-0 text-right">{shown || done ? `≈ ${inr(rupees)} · not connected` : "not connected"}</span>
            </li>
          </ol>
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
          <Button onClick={submit} busy={busy} disabled={!shown || !to || !upiOk}>
            {shown ? `Exchange ${dollars(shown.units)}` : "Exchange"}
          </Button>
        )}
      </div>
    </>
  );
}

function Opt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}
