import { useEffect, useState } from "react";
import { View } from "react-native";
import { MoneyInput } from "@/components/programs/kit";
import { Pill } from "@/components/requests/bits";
import { Button, ErrorText, Field, Footer, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { cashOut, inr, quote, UPI_RE, type Quote } from "@/lib/cashout";
import { useMode } from "@/lib/config";
import { humanError } from "@/lib/errors";
import { formatMoney, fromLocal } from "@/lib/money";
import { openKin } from "@/lib/nav";
import { useTheme } from "@/theme";

// Port of app/src/app/cashout/page.tsx: amount → UPI ID → live quote (Agora fixed price) → Identity check → settled.
export default function CashOut() {
  const t = useTheme();
  const input = useInputStyle();
  const me = useAccount().profile?.address;
  const mode = useMode();
  const [amount, setAmount] = useState("");
  const [upi, setUpi] = useState("");
  const [q, setQ] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ hash: string; q: Quote; upi: string } | null>(null);

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const upiOk = UPI_RE.test(upi.trim());

  useEffect(() => {
    if (units === 0n || mode === "main") return;
    let live = true;
    const id = setTimeout(() => quote(units).then((x) => live && setQ(x), () => live && setQ(null)), 300);
    return () => {
      live = false;
      clearTimeout(id);
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

  const card = { gap: 8, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 16 } as const;
  const row = (k: string, v: string) => (
    <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: t.muted, fontSize: 14 }}>{k}</Text>
      <Text style={{ color: t.muted, fontSize: 14, fontVariant: ["tabular-nums"] }}>{v}</Text>
    </View>
  );

  if (done) {
    return (
      <Screen title="Cash out" back scroll>
        <View style={{ alignItems: "center", gap: 12, paddingTop: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: t.good, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: t.brandInk, fontSize: 32, fontWeight: "700" }}>✓</Text>
          </View>
          <Serif size={36}>{`${inr(done.q.inr)} on its way`}</Serif>
          <Text style={{ color: t.muted }}>{`To ${done.upi} · usually within minutes`}</Text>
        </View>
        <View style={card}>
          <Pill tone="warn">Practice cash-out</Pill>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            {`Your ${formatMoney(done.q.units, "USD")} was settled at a fixed price through Agora. No real rupees move with practice money.`}
          </Text>
        </View>
        <Footer>
          <Button title="Proof of payment" variant="soft" onPress={() => openKin(`/details?tx=${done.hash}`)} />
        </Footer>
      </Screen>
    );
  }

  return (
    <Screen title="Cash out to UPI" back scroll>
      {mode === "main" ? (
        <View style={card}>
          <Pill tone="warn">Coming soon</Pill>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            Cashing out real money to Indian bank accounts is coming soon. Turn off Real money in Settings to try a practice cash-out.
          </Text>
        </View>
      ) : (
        <>
          <MoneyInput label="How much?" value={amount} onChange={(v) => /^\d{0,9}(\.\d{0,2})?$/.test(v) && (setAmount(v), setErr(""))} />
          <Field label="Your UPI ID" hint={upi && !upiOk ? "Looks like name@bank" : undefined}>
            <TextInput style={input} placeholder="name@okbank" placeholderTextColor={t.muted} value={upi} maxLength={100}
              onChangeText={(v) => (setUpi(v), setErr(""))} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          </Field>
          {shown && (
            <View style={card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: t.ink, fontWeight: "600" }}>You get</Text>
                <Serif size={26}>{inr(shown.inr)}</Serif>
              </View>
              {row(`${formatMoney(shown.units, "USD")} at ${inr(shown.rate)} / $1`, inr(shown.gross))}
              {row("Payout fee", `− ${inr(shown.fee)}`)}
              {row("Tax deducted (TDS 1%)", `− ${inr(shown.tds)}`)}
              <Text style={{ color: t.muted, fontSize: 12, paddingTop: 4 }}>Settled at a fixed price through Agora · Practice money</Text>
            </View>
          )}
          <ErrorText>{err}</ErrorText>
          <Footer>
            <Button title={shown ? `Cash out ${inr(shown.inr)}` : "Cash out"} onPress={() => void submit()} busy={busy}
              disabled={!shown || !upiOk || shown.inr <= 0} />
          </Footer>
        </>
      )}
    </Screen>
  );
}
