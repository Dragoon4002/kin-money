import { Banknote, Check, DollarSign, Lock, Send, type LucideIcon } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { MoneyInput } from "@/components/programs/kit";
import { Button, Chip, ErrorText, Footer, Screen, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { agoraReady, cashOut, inr, onrampQuote, quoteAgora, rupeesFor, saveCashout, usdcOf, type Hop, type OnrampQuote } from "@/lib/cashout";
import { useMode } from "@/lib/config";
import { humanError } from "@/lib/errors";
import { formatMoney, fromLocal } from "@/lib/money";
import { openKin } from "@/lib/nav";
import { play } from "@/lib/sound";
import { Grain, Label, MONO, P } from "@/components/gift/GiftNote";
import { useTheme } from "@/theme";

// Port of app/src/app/cashout/page.tsx: AUSD → USDC with Agora → INR with Onramp. Amount → Agora's fixed price +
// Onramp's rupee quote → one Identity check → AUSD settles into USDC through Agora (KinCashoutV2) → Onramp prices the
// USDC in rupees. Practice money: the Agora leg is real (testnet); the rupee payout is the practice part.
// AUSD/USDC are named on this screen on purpose (user decision, Oct 11; docs/PRODUCT.md).

type StepState = "todo" | "doing" | "done" | "practice";
type Step = { icon: LucideIcon; title: string; sub?: string; state: StepState };
type Run = { phase: 1 | 2 | 3; ausd: number; hash?: string; hops?: Hop[]; usdc?: number; rupees?: number; quote?: OnrampQuote; at?: number };

const usd = (n: number) => n.toFixed(2);

export default function CashOut() {
  const mode = useMode();
  return (
    <Screen title="Cash out" back scroll>
      {mode === "main" ? <RealSoon /> : <Practice />}
    </Screen>
  );
}

function useCard() {
  const t = useTheme();
  return { gap: 8, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 16 } as const;
}

/** AUSD —Agora→ USDC —Onramp→ INR, with the amount at each stop. */
function Route({ ausd, usdc, rupees, live }: { ausd?: number; usdc?: number; rupees?: number; live?: number }) {
  const t = useTheme();
  const card = useCard();
  const stops = [
    ["AUSD", ausd !== undefined ? usd(ausd) : "—"],
    ["USDC", usdc !== undefined ? usd(usdc) : "—"],
    ["INR", rupees !== undefined ? inr(rupees) : "—"],
  ] as const;
  const by = ["Agora", "Onramp"];
  return (
    <View style={[card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }]}>
      {stops.map(([coin, amt], i) => (
        <View key={coin} style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}>
          <View style={{ alignItems: "center", flexShrink: 1, opacity: live !== undefined && live < i + 1 ? 0.5 : 1 }}>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{coin}</Text>
            <Text numberOfLines={1} style={{ color: t.ink, fontSize: 17, fontVariant: ["tabular-nums"] }}>{amt}</Text>
          </View>
          {i < 2 && (
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: t.muted, fontSize: 12 }}>{by[i]}</Text>
              <Text style={{ color: t.muted, fontSize: 17, lineHeight: 18 }}>→</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function Practice() {
  const t = useTheme();
  const me = useAccount().profile?.address;
  const [amount, setAmount] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [q, setQ] = useState<{ units: bigint; out: bigint; quote?: OnrampQuote } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState("");

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;

  useEffect(() => {
    agoraReady().then(setReady);
  }, []);

  // Re-quote as the amount changes (debounced): Agora's fixed price, then Onramp's rupees for that USDC.
  useEffect(() => {
    if (units === 0n || !ready) return;
    let live = true;
    const id = setTimeout(async () => {
      try {
        const out = await quoteAgora(units);
        const quote = await onrampQuote(usdcOf(out)).catch(() => undefined);
        if (live) setQ({ units, out, quote });
      } catch {
        if (live) setQ(null);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [units, ready]);
  const shown = q && q.units === units ? q : null;
  const usdc = shown ? usdcOf(shown.out) : 0;
  const est = rupeesFor(usdc);
  const rupees = shown?.quote?.rupees ?? est.inr;

  async function submit() {
    if (!me || !shown) return;
    setErr("");
    const ausd = Number(shown.units) / 1e6;
    setRun({ phase: 1, ausd });
    try {
      if ((await getBalance(me)) < shown.units) throw new Error("insufficient balance");
      const l1 = await cashOut(me, shown.units, shown.out);
      const got = usdcOf(l1.received);
      setRun({ phase: 2, ausd, hash: l1.hash, hops: l1.hops, usdc: got });
      const quote = await onrampQuote(got).catch(() => undefined);
      const paid = quote?.rupees ?? rupeesFor(got).inr;
      void saveCashout(l1.hash, { rupees: paid, practice: true });
      setRun({ phase: 3, ausd, hash: l1.hash, hops: l1.hops, usdc: got, rupees: paid, quote, at: Date.now() });
      play("cashout");
    } catch (e) {
      setRun(null);
      setErr(humanError(e));
    }
  }

  if (run) {
    const at = (p: number): StepState => (run.phase > p ? "done" : run.phase === p ? "doing" : "todo");
    const steps: Step[] = [
      { icon: Lock, title: "Price locked", sub: `${usd(run.ausd)} AUSD at Agora's fixed price`, state: "done" },
      {
        icon: DollarSign,
        title: "AUSD → USDC with Agora",
        sub: run.phase === 1 ? "Confirm with your Identity check" : `${usd(run.usdc ?? 0)} USDC settled in about a second`,
        state: at(1),
      },
      {
        icon: Banknote,
        title: "USDC → INR with Onramp",
        sub: run.quote ? `₹${run.quote.rate.toFixed(2)} per USDC · fees and 1% tax included` : run.phase === 3 ? "Estimated at today's rate" : undefined,
        state: at(2),
      },
      { icon: Send, title: run.rupees ? `${inr(run.rupees)} to your bank` : "Rupees to your bank", sub: "Practice money: no rupees move", state: run.phase === 3 ? "practice" : "todo" },
    ];
    const body = (
      <>
        <Route ausd={run.ausd} usdc={run.usdc} rupees={run.rupees} live={run.phase} />
        <Steps steps={steps} />
        {run.phase === 3 && <DoneBill run={run} />}
        {run.hops && <Flow hops={run.hops} rupees={run.rupees} />}
        {run.hash && (
          <Pressable onPress={() => openKin(`/details?tx=${run.hash}`)} accessibilityRole="link" style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: t.brand, fontSize: 14, fontWeight: "600" }}>Proof of payment</Text>
          </Pressable>
        )}
      </>
    );
    if (run.phase < 3) return body;
    return (
      <>
        <View style={{ alignItems: "center", gap: 12, paddingTop: 16 }}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: t.good, alignItems: "center", justifyContent: "center" }}>
            <Check color="#1b1815" size={36} />
          </Animated.View>
          <Serif size={34}>{`${inr(run.rupees!)} on its way`}</Serif>
          <Text style={{ color: t.muted }}>AUSD → USDC → INR · Practice cash-out</Text>
        </View>
        {body}
        <Footer>
          <Button title="Cash out again" variant="soft" onPress={() => (setRun(null), setAmount(""))} />
        </Footer>
      </>
    );
  }

  return (
    <>
      <MoneyInput label="How much?" value={amount} onChange={(v) => /^\d{0,9}(\.\d{0,2})?$/.test(v) && (setAmount(v), setErr(""))} />
      <Route ausd={units ? Number(units) / 1e6 : undefined} usdc={shown ? usdc : undefined} rupees={shown ? rupees : undefined} />
      {ready === false && <ErrorText>Cash out is resting right now. Try again soon.</ErrorText>}
      {shown && <Bill usdc={usdc} rupees={rupees} quote={shown.quote} />}
      <ErrorText>{err}</ErrorText>
      <Footer>
        <Button title={shown ? `Cash out ${inr(rupees)}` : "Cash out"} onPress={() => void submit()} disabled={!shown || rupees <= 0} />
      </Footer>
    </>
  );
}

/** Real money: the same route, switched on once Agora onboarding and Onramp's payout are live. */
function RealSoon() {
  const t = useTheme();
  const card = useCard();
  const steps: Step[] = [
    { icon: DollarSign, title: "AUSD → USDC with Agora", sub: "Fixed price, locked for 3 minutes", state: "todo" },
    { icon: Banknote, title: "USDC → INR with Onramp", sub: "Live rate, fees and 1% tax shown first", state: "todo" },
    { icon: Send, title: "Rupees to your bank", sub: "Verified once with Onramp", state: "todo" },
  ];
  return (
    <>
      <Route />
      <View style={card}>
        <Chip tone="warn">Coming soon</Chip>
        <Text style={{ color: t.muted, fontSize: 14 }}>Real-money cash-out is in onboarding with Agora and Onramp. Here&apos;s how it will work.</Text>
      </View>
      <Steps steps={steps} />
      <Text style={{ color: t.muted, fontSize: 14, paddingHorizontal: 4 }}>Turn off Real money in Settings to try a practice cash-out now.</Text>
      <Footer>
        <Button title="Coming soon" disabled />
      </Footer>
    </>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  const t = useTheme();
  const card = useCard();
  return (
    <View style={[card, { gap: 16 }]} accessibilityLiveRegion="polite">
      {steps.map((s) => {
        const Icon = s.state === "done" ? Check : s.icon;
        const bg = s.state === "done" ? t.good : s.state === "practice" ? `${t.warn}33` : t.surface2;
        return (
          <View key={s.title} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, opacity: s.state === "todo" ? 0.5 : 1 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: bg }}>
              <Icon color={s.state === "done" ? "#1b1815" : t.ink} size={18} />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: t.ink, fontWeight: "600" }}>{s.state === "doing" ? `${s.title}…` : s.title}</Text>
              {!!s.sub && <Text style={{ color: t.muted, fontSize: 14 }}>{s.sub}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Every money movement in the cash-out, read from the receipt, plus the rupee leg. Printed on paper. */
function Flow({ hops, rupees }: { hops: Hop[]; rupees?: number }) {
  return (
    <Paper>
      <Label>WHERE YOUR MONEY GOES</Label>
      {hops.map((h, i) => <Line key={i} k={`${i + 1}. ${h.from} → ${h.to}`} v={h.amount} />)}
      <Line k={`${hops.length + 1}. Onramp → your bank`} v={rupees ? `${inr(rupees)} · practice` : "…"} muted />
    </Paper>
  );
}

/** Rupee breakdown for `usdc`: Onramp's quote when it answered, else today's estimate. Same numbers the page shows. */
function breakdown(usdc: number, quote?: OnrampQuote) {
  if (quote) return { rate: `₹${quote.rate.toFixed(2)}`, gross: usdc * quote.rate, feeLabel: "Onramp + bank fees", fees: quote.fees.onramp + quote.fees.gateway, tds: quote.fees.tds };
  const e = rupeesFor(usdc);
  return { rate: inr(e.rate), gross: e.gross, feeLabel: "Payout fee", fees: e.fee, tds: e.tds };
}

/** The quote as an itemized bill on paper. No Onramp quote = estimated rate. */
function Bill({ usdc, rupees, quote }: { usdc: number; rupees: number; quote?: OnrampQuote }) {
  const b = breakdown(usdc, quote);
  return (
    <Paper>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Label>QUOTE</Label><Label>{quote ? "LIVE QUOTE" : "ESTIMATE"}</Label></View>
      <Line k="AUSD → USDC with Agora" v={`${usd(usdc)} USDC`} />
      <Line k={`USDC → INR at ${b.rate}`} v={inr(b.gross)} />
      <Line k={b.feeLabel} v={`− ${inr(b.fees)}`} muted />
      <Line k="Tax deducted (TDS 1%)" v={`− ${inr(b.tds)}`} muted />
      <Total k={quote ? "YOU GET" : "YOU GET ABOUT"} v={inr(rupees)} />
      <Text style={{ color: P.muted, fontFamily: MONO, fontSize: 11, lineHeight: 15 }}>
        {`Practice money: Agora settles into its test USDC; Onramp ${quote?.sandbox ? "quotes from its sandbox" : "rate estimated"}; rupees go to the bank you verify once with Onramp.`}
      </Text>
    </Paper>
  );
}

/** Done details on paper: what you cashed out → what reached the bank, plus Kin fee and time. */
function DoneBill({ run }: { run: Run }) {
  const usdc = run.usdc ?? 0;
  const b = breakdown(usdc, run.quote);
  const at = run.at ? new Date(run.at) : null;
  return (
    <Paper>
      <Label>CASH-OUT DETAILS</Label>
      <Line k="You cashed out" v={`${usd(run.ausd)} AUSD`} />
      <Line k="Agora settled" v={`${usd(usdc)} USDC`} />
      <Line k={run.quote ? "Onramp rate" : "Estimated rate"} v={`${b.rate} / USDC`} />
      <Line k={b.feeLabel} v={`− ${inr(b.fees)}`} muted />
      <Line k="Tax deducted (TDS 1%)" v={`− ${inr(b.tds)}`} muted />
      <Total k="TO YOUR BANK" v={inr(run.rupees ?? 0)} />
      <Dash />
      <Field k="KIN FEE" v={formatMoney(0n)} />
      {at && <Field k="DATE & TIME" v={`${at.toLocaleDateString(undefined, { dateStyle: "medium" })} · ${at.toLocaleTimeString(undefined, { timeStyle: "short" })}`} />}
    </Paper>
  );
}

// Printed-paper bits (same paper as the receipt ticket; web kt-* / kd-paper-shadow).
function Paper({ children }: { children: ReactNode }) {
  return (
    <View style={{ gap: 8, overflow: "hidden", borderRadius: 4, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, backgroundColor: P.paper, boxShadow: "0 6px 8px rgba(0,0,0,0.22), 0 1px 1px rgba(0,0,0,0.18)" }}>
      <Grain />
      {children}
    </View>
  );
}

const Dash = () => <View style={{ borderTopWidth: 2, borderStyle: "dashed", borderColor: P.line, opacity: 0.8 }} />;

/** "Label ........ value" printed line. */
function Line({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  const c = muted ? P.muted : P.ink;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
      <Text style={{ flexShrink: 1, color: c, fontFamily: MONO, fontSize: 13 }}>{k}</Text>
      <View style={{ flex: 1, minWidth: 16, marginBottom: 4, borderBottomWidth: 2, borderStyle: "dotted", borderColor: P.line }} />
      <Text style={{ color: c, fontFamily: MONO, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{v}</Text>
    </View>
  );
}

function Total({ k, v }: { k: string; v: string }) {
  return (
    <>
      <Dash />
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: P.ink, fontFamily: MONO, fontSize: 14, fontWeight: "700" }}>{k}</Text>
        <Text style={{ color: P.ink, fontSize: 30, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{v}</Text>
      </View>
    </>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Label>{k}</Label>
      <Text style={{ color: P.ink, fontFamily: MONO, fontSize: 14, fontWeight: "700" }}>{v}</Text>
    </View>
  );
}
