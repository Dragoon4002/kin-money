import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { BigRing, Celebrate, OfGoal } from "@/components/pot/bits";
import { Loading, MoneyInput, Sheet, Status, jarMeta, useAction, useLoad, useMe } from "@/components/programs/kit";
import { Band, Button, Chip, ErrorText, Footer, IconTile, Row, Screen, Serif, Text } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { ICON } from "@/lib/icons";
import { formatMoney, fromLocal } from "@/lib/money";
import { getPot, isJar, OldPotAbi, potAdds, potAt, potRoute, same, txEvents } from "@/lib/programs";
import { call } from "@/lib/tx";
import { fonts, useTheme } from "@/theme";

// Port of app/src/app/jars/[id]/page.tsx.
export default function JarDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const r = potRoute(id);
  const { data, error, reload } = useLoad(async () => {
    // ponytail: old jars' adds aren't in our history, so their list stays hidden.
    const [pot, adds] = await Promise.all([getPot(r!.id, r!.old), r!.old ? [] : potAdds(r!.id).catch(() => [])]);
    return { pot, adds };
  }, r ? id : undefined);
  const [amount, setAmount] = useState("");
  const [sheet, setSheet] = useState<"" | "add" | "break">("");
  const [party, setParty] = useState(0n);
  const { busy, status, error: actionError, run } = useAction();

  const missing = <Screen title="Savings jar" back><ErrorText>We couldn&apos;t find this jar.</ErrorText></Screen>;
  if (!r) return missing;
  if (!data || !me) return <Screen title="Savings jar" back>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { pot, adds } = data;
  if (!pot.target || !isJar(pot) || !same(pot.beneficiaries[0], me)) return missing;
  const { name, icon } = jarMeta(pot.id, pot.old);
  const pct = pot.closed ? 0 : Number(pot.balance) / Number(pot.target);
  const left = pot.target - pot.balance;

  async function add() {
    const value = fromLocal(amount);
    if (!value) return;
    const ok = await run(async (say) => {
      const hash = await call(potAt(pot), KinPotAbi, "contribute", [pot.id], { fund: value });
      say("Into the jar…");
      const paid = (await txEvents(hash, pot.old ? OldPotAbi : KinPotAbi)).find((l) => l.eventName === "PotPaid");
      return { payout: paid ? (paid.args as { amount: bigint }).amount : 0n };
    });
    if (ok) {
      setSheet("");
      setAmount("");
      setParty(ok.payout);
      reload();
    }
  }

  async function breakJar() {
    const ok = await run(async () => (await call(potAt(pot), KinPotAbi, "close", [pot.id]), true));
    if (ok) {
      setSheet("");
      reload();
    }
  }

  if (party) {
    return (
      <Celebrate
        title="You've reached your savings goal!"
        amount={formatMoney(party)}
        subtitle={`Great job sticking with it. Your ${name} money is in your balance.`}
        shareText={`I just saved ${formatMoney(party)} for my ${name} on Kin 🎉`}
        onClose={() => setParty(0n)}
      />
    );
  }

  const close = () => !busy && setSheet("");
  return (
    <Screen title={name} back scroll>
      <View style={{ alignItems: "center", gap: 16 }}>
        <BigRing value={pct} label="Saved" />
        <OfGoal have={formatMoney(pot.balance)} goal={formatMoney(pot.target)} />
        {pot.closed ? (
          <Chip>This jar is closed</Chip>
        ) : pot.round > 0n ? (
          <Chip tone="good">Goal reached {pot.round > 1n ? `${pot.round}× ` : ""}✓✓ · saving again</Chip>
        ) : (
          <Text style={{ color: t.muted, fontSize: 14 }}>{formatMoney(left)} to go</Text>
        )}
      </View>

      {!pot.old && <View>
        <Band>Added lately</Band>
        {adds.length ? (
          adds.map((a, i) => (
            <Row
              key={i}
              icon={<IconTile icon={ICON[icon]} />}
              title="Added to jar"
              trail={<Text style={{ fontFamily: fonts.serif, fontSize: 24, color: t.good, fontVariant: ["tabular-nums"] }}>+{formatMoney(a.amount)}</Text>}
            />
          ))
        ) : (
          <Text style={{ color: t.muted, fontSize: 14, paddingVertical: 16 }}>Every bit you add shows up here.</Text>
        )}
      </View>}

      <Sheet open={sheet === "add"} onClose={close}>
        <Serif size={30}>Add money</Serif>
        <MoneyInput label="Amount" value={amount} onChange={setAmount} hint={`${formatMoney(left)} fills the jar.`} />
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy ? status : ""}</Status>
        <Button title="Add to jar" onPress={add} busy={busy} disabled={!Number(amount)} />
      </Sheet>
      <Sheet open={sheet === "break"} onClose={close}>
        <Serif size={30}>Take {formatMoney(pot.balance)} out?</Serif>
        <Text style={{ color: t.muted, fontSize: 16 }}>It goes back to your balance and this jar closes. You can start a new one any time.</Text>
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy ? status : ""}</Status>
        <Button title="Take it out" onPress={breakJar} busy={busy} />
        <Button title="Keep saving" variant="ghost" onPress={() => setSheet("")} disabled={busy} />
      </Sheet>

      <Footer>
        <ErrorText>{sheet ? "" : actionError}</ErrorText>
        {!pot.closed && <Button title="Add money" onPress={() => { setAmount(""); setSheet("add"); }} />}
        {!pot.closed && pot.balance > 0n && <Button title="Take it out" variant="ghost" onPress={() => setSheet("break")} />}
      </Footer>
    </Screen>
  );
}
