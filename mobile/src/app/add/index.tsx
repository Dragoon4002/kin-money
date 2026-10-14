import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { erc20Abi } from "viem";
import { SendThis, about, timeLeft, useAddStatus, useSecondsLeft } from "@/components/addmoney/PayIn";
import { Sheet, share, useMe } from "@/components/programs/kit";
import { Card, Delivered } from "@/components/trips/bits";
import { Button, ErrorText, Footer, Label, Screen, Serif, Text, TextInput } from "@/components/ui";
import { MONAD_USDC, SOURCES, chainOf, coinOf, convertToDollars, type AddQuote, type AddStatus } from "@/lib/addMoney";
import { API_BASE, networks, useMode } from "@/lib/config";
import { humanError } from "@/lib/errors";
import { ICON, type IconName } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { openKin } from "@/lib/nav";
import { useTheme } from "@/theme";

// Port of app/src/app/add/page.tsx. Add money from another account: pick chain + token, ask for N dollars → one-time
// code (Aurora Intents, EXACT_OUTPUT) → the user sends, or shares a pay link (/add/pay?d=) so someone else does → it
// lands in the user's own Kin account → one tap turns it into dollars. Real money only (Aurora runs on mainnet).
// "Chain" / "Token" labels: user exception (PRODUCT.md, Oct 13).

type Pending = { q: AddQuote; source: string };
// ponytail: module scope (web: sessionStorage) so leaving and reopening the screen resumes; not written to the phone.
let saved: Pending | null = null;
const remember = (p: Pending | null) => ((saved = p), p);

const CHAINS = [...new Set(SOURCES.map(chainOf))];

const QUOTE_ERRORS: Record<string, string> = {
  "not connected": "Adding money this way is resting right now. Try again soon.",
  "no quote": "Couldn't get a price for that right now. Try another amount.",
  invalid: "Check the amount and try again.",
  busy: "Couldn't reach our partner. Your money is safe — try again.",
  "slow down": "Too many tries. Wait a minute, then try again.",
};

export default function AddMoney() {
  const mode = useMode();
  return <Screen title="Add money" back scroll>{mode === "main" ? <Add /> : <PracticeNote />}</Screen>;
}

function PracticeNote() {
  const t = useTheme();
  return (
    <Card>
      <Text style={{ color: t.ink, fontSize: 16 }}>Adding money from another account works with real money. Turn on Real money in Me → Money.</Text>
      <Pressable onPress={() => openKin("/me")} accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={{ color: t.brand, fontSize: 16, fontWeight: "600" }}>Go to Me</Text>
      </Pressable>
    </Card>
  );
}

function Add() {
  const [pending, setPending] = useState<Pending | null>(saved);
  const start = (p: Pending | null) => setPending(remember(p));
  return pending ? <Tracking p={pending} onReset={() => start(null)} /> : <><Waiting /><Form onQuote={start} /></>;
}

const proofLink = (hash: string, color: string) => (
  <Pressable onPress={() => openKin(`/details?tx=${hash}`)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center", alignSelf: "center" }}>
    <Text style={{ color, fontSize: 14, fontWeight: "600" }}>Proof of payment</Text>
  </Pressable>
);

/** Money that already arrived but isn't dollars yet (e.g. the screen was closed before the last tap) → one tap. */
function Waiting() {
  const t = useTheme();
  const me = useMe();
  const [units, setUnits] = useState(0n);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ hash: string; ausdOut: bigint } | null>(null);

  useEffect(() => {
    if (!me) return;
    networks.main.client
      .readContract({ address: MONAD_USDC, abi: erc20Abi, functionName: "balanceOf", args: [me] })
      .then(setUnits)
      .catch(() => {});
  }, [me, done]);

  async function convert() {
    setBusy(true);
    setErr("");
    try {
      setDone(await convertToDollars(units));
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <Card style={{ alignItems: "center" }}>
        <Serif size={26}>{formatMoney(done.ausdOut)} added</Serif>
        {proofLink(done.hash, t.brand)}
      </Card>
    );
  if (units < 10_000n) return null; // under a cent: not worth a tap
  return (
    <Card>
      <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{formatMoney(units)} arrived and is waiting</Text>
      <Text style={{ color: t.muted, fontSize: 14 }}>Add it to your balance to send or spend it.</Text>
      <Button title={`Add ${formatMoney(units)} to your balance`} onPress={convert} busy={busy} />
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

/** Dropdown (web Pick): tap opens a sheet of options. */
function Pick({ label, value, options, onPick }: { label: string; value: string; options: { value: string; text: string }[]; onPick: (v: string) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const Chevron = ICON.chevron;
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Label>{label}</Label>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${current?.text ?? ""}`}
        style={{ height: 56, borderRadius: 20, borderWidth: 1, borderColor: open ? t.brand : t.line, backgroundColor: t.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 16, fontWeight: "600" }}>{current?.text}</Text>
        <View style={{ transform: [{ rotate: "90deg" }] }}><Chevron color={t.muted} size={18} /></View>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <Label>{label}</Label>
        {options.map((o) => {
          const on = o.value === value;
          const Check = ICON.check;
          return (
            <Pressable key={o.value} onPress={() => (onPick(o.value), setOpen(false))} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ minHeight: 48, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: on || pressed ? t.brandSoft : "transparent" })}>
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{o.text}</Text>
              {on && <Check color={t.brand} size={18} />}
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

function Form({ onQuote }: { onQuote: (p: Pending) => void }) {
  const t = useTheme();
  const me = useMe();
  const [chain, setChain] = useState(chainOf(SOURCES[0]));
  const [source, setSource] = useState(SOURCES[0].id);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tokens = SOURCES.filter((s) => chainOf(s) === chain);
  const ok = Number(amount) > 0;

  async function submit() {
    if (!me || !ok) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/addmoney`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, amount, address: me }),
      });
      const j = await res.json();
      if (j.depositAddress) return onQuote({ q: j as AddQuote, source });
      setErr(j.error === "too little" && j.min ? `Ask for at least $${j.min}.` : QUOTE_ERRORS[j.error] ?? "Something went wrong. Your money is safe.");
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pick label="Chain" value={chain} options={CHAINS.map((c) => ({ value: c, text: c }))}
          onPick={(c) => (setChain(c), setSource(SOURCES.find((s) => chainOf(s) === c)!.id), setErr(""))} />
        <Pick label="Token" value={source} options={tokens.map((s) => ({ value: s.id, text: coinOf(s) }))}
          onPick={(id) => (setSource(id), setErr(""))} />
      </View>

      <View style={{ gap: 8 }}>
        <Label>Amount</Label>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
          <Serif size={60} color={t.muted}>$</Serif>
          <TextInput keyboardType="decimal-pad" placeholder="0" placeholderTextColor={t.muted} value={amount} accessibilityLabel="Amount in dollars"
            style={{ minWidth: 40, color: t.ink, fontFamily: "InstrumentSerif_400Regular", fontSize: 60, textAlign: "center", fontVariant: ["tabular-nums"], padding: 0 }}
            onChangeText={(raw) => {
              const v = raw.replace(",", ".");
              if (!/^\d{0,6}(\.\d{0,2})?$/.test(v)) return;
              setAmount(v);
              setErr("");
            }} />
        </View>
      </View>

      <Text style={{ borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: t.line, padding: 16, color: t.muted, fontSize: 14 }}>
        You&apos;ll get a link to share. Whoever opens it sees exactly what to send and where. If something goes wrong, the money is held safely in your name and we help you get it back.
      </Text>

      <ErrorText>{err}</ErrorText>
      <Footer>
        <Button title="Request payment" onPress={submit} busy={busy} disabled={!ok} />
        {busy && <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>Getting today&apos;s price…</Text>}
      </Footer>
    </>
  );
}

type StepState = "todo" | "doing" | "done";
const ORDER: AddStatus[] = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS"];

function Tracking({ p, onReset }: { p: Pending; onReset: () => void }) {
  const t = useTheme();
  const q: AddQuote = { ...p.q, source: p.q.source || p.source };
  const live = useAddStatus(q.depositAddress);
  const status: AddStatus = live?.status ?? "PENDING_DEPOSIT";
  const waiting = status === "PENDING_DEPOSIT";
  const left = useSecondsLeft(q.deadline, waiting);
  const expired = waiting && left === 0;
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState<{ hash: string; ausdOut: bigint } | null>(null);
  const [err, setErr] = useState("");
  const out = BigInt(live?.amountOut ?? q.amountOut);

  function shareLink() {
    const src = SOURCES.find((s) => s.id === q.source);
    void share(`Pay me ${formatMoney(BigInt(q.amountOut))}${src ? ` with ${src.label}` : ""}`, `${API_BASE}/add/pay?d=${encodeURIComponent(q.depositAddress)}`);
  }

  async function convert() {
    setConverting(true);
    setErr("");
    try {
      const r = await convertToDollars(out);
      remember(null);
      setDone(r);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setConverting(false);
    }
  }

  if (done)
    return (
      <>
        <Delivered title={`${formatMoney(done.ausdOut)} added`} subtitle="It's in your balance, ready to send" />
        {proofLink(done.hash, t.brand)}
        <Footer>
          <Button title="Send money" onPress={() => openKin("/send")} />
        </Footer>
      </>
    );

  if (status === "REFUNDED" || status === "FAILED")
    return (
      <>
        <Card style={{ alignItems: "center" }}>
          <Serif size={26}>{status === "REFUNDED" ? "Held for you" : "This one didn't go through"}</Serif>
          <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>
            {status === "REFUNDED" ? "The money is held safely in your name with our partner. Message us and we'll help you get it back." : "If money was sent, it's held safely in your name."}
          </Text>
        </Card>
        <Footer>
          <Button title="Try again" onPress={onReset} />
        </Footer>
      </>
    );

  const at = ORDER.indexOf(status === "INCOMPLETE_DEPOSIT" ? "KNOWN_DEPOSIT_TX" : status);
  const state = (i: number): StepState => (status === "SUCCESS" || at > i ? "done" : at === i ? "doing" : "todo");
  const steps: { icon: IconName; title: string; sub?: string }[] = [
    { icon: "pending", title: "Waiting for the money", sub: waiting ? `Request expires in ${timeLeft(left)}` : undefined },
    {
      icon: "check",
      title: status === "INCOMPLETE_DEPOSIT" ? "Amount didn't match" : "Received",
      sub: status === "INCOMPLETE_DEPOSIT" ? "Send the rest, or it's held safely in your name" : undefined,
    },
    { icon: "send", title: "On its way", sub: status === "PROCESSING" ? `Usually ${about(q.timeEstimate)}` : undefined },
    { icon: "dollar", title: "Arrived", sub: status === "SUCCESS" ? `${formatMoney(out)} in your account` : undefined },
  ];

  return (
    <>
      {waiting && !expired && (
        <>
          <Button title="Share payment link" onPress={shareLink} />
          <SendThis q={q} left={left} />
        </>
      )}

      {expired ? (
        <Card style={{ alignItems: "center" }}>
          <Serif size={26}>This request expired</Serif>
          <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>Don&apos;t send to it. Start again for a fresh one. If money was already sent, it&apos;s held safely in your name.</Text>
        </Card>
      ) : (
        <Card style={{ gap: 16 }}>
          {steps.map((s, i) => {
            const st = state(i);
            const Icon = ICON[st === "done" ? "check" : s.icon];
            return (
              <View key={s.icon} accessibilityLiveRegion={st === "doing" ? "polite" : "none"} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, opacity: st === "todo" ? 0.5 : 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: st === "done" ? t.good : st === "doing" ? t.brandSoft : t.surface2 }}>
                  <Icon color={st === "done" ? "#fff" : t.ink} size={18} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{s.title}</Text>
                  {s.sub && <Text style={{ color: t.muted, fontSize: 14, fontVariant: ["tabular-nums"] }}>{s.sub}</Text>}
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <ErrorText>{err}</ErrorText>
      <Footer>
        {status === "SUCCESS" ? (
          <>
            <Button title={`Add ${formatMoney(out)} to your balance`} onPress={convert} busy={converting} />
            {converting && <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>Adding it to your balance — a few seconds…</Text>}
          </>
        ) : (
          (waiting || expired) && <Button variant="soft" title={expired ? "Start again" : "Start over"} onPress={onReset} />
        )}
      </Footer>
    </>
  );
}
