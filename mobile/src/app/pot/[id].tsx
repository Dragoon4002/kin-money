import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { BigRing, Celebrate, InviteSheet, OfGoal } from "@/components/pot/bits";
import { Loading, MoneyInput, PotFor, Sheet, Status, Who, WhoAvatar, useAction, useLoad, useMe } from "@/components/programs/kit";
import { Band, Button, Chip, ErrorText, Footer, Row, Screen, Serif, Text } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { createPotInvite, disablePotInvite, inviteKeyOf, savedLink } from "@/lib/potLinks";
import { getPot, OldPotAbi, potAt, potPayouts, potRoute, same, txEvents, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";
import { fonts, useTheme } from "@/theme";

// Port of app/src/app/pot/[id]/page.tsx.
export default function PotDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const r = potRoute(id);
  const { data, error, reload } = useLoad(async () => {
    // Old pots (before the update) have no invite links; their payouts aren't in our history.
    const [pot, payouts, myKey] = await Promise.all([getPot(r!.id, r!.old), r!.old ? [] : potPayouts(r!.id), me && !r!.old ? inviteKeyOf(r!.id, me) : ZERO]);
    return { pot, payouts, myKey };
  }, me && r ? `${id}.${me}` : undefined);
  const [amount, setAmount] = useState("");
  const [sheet, setSheet] = useState<"" | "chip" | "close" | "invite">("");
  const [link, setLink] = useState("");
  const [party, setParty] = useState(0n);
  const { busy, status, error: actionError, run } = useAction();

  if (!r) return <Screen title="Family pot" back><ErrorText>We couldn&apos;t find this pot.</ErrorText></Screen>;
  if (!data) return <Screen title="Family pot" back>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { pot, payouts, myKey } = data;
  if (!pot.target) return <Screen title="Family pot" back><ErrorText>We couldn&apos;t find this pot.</ErrorText></Screen>;
  const iMember = pot.members.some((m) => same(m, me));
  const iGet = pot.beneficiaries.some((b) => same(b, me));
  const split = pot.beneficiaries.length;
  const pct = pot.closed ? 0 : Number(pot.balance) / Number(pot.target);
  const left = pot.target - pot.balance;

  async function chipIn() {
    const value = fromLocal(amount);
    if (!value) return;
    const ok = await run(async (say) => {
      const hash = await call(potAt(pot), KinPotAbi, "contribute", [pot.id], { fund: value });
      say("Adding it to the pot…");
      const paid = (await txEvents(hash, pot.old ? OldPotAbi : KinPotAbi)).find((l) => l.eventName === "PotPaid");
      const payout = paid ? (paid.args as { amount: bigint }).amount : 0n;
      if (payout && split === 1) void recordPayment(pot.beneficiaries[0], payout);
      return { payout };
    });
    if (ok) {
      setSheet("");
      setAmount("");
      setParty(ok.payout);
      reload();
    }
  }

  async function closePot() {
    const ok = await run(async () => (await call(potAt(pot), KinPotAbi, "close", [pot.id]), true));
    if (ok) {
      setSheet("");
      reload();
    }
  }

  async function openInvite() {
    setSheet("invite");
    const saved = savedLink(pot.id, me!, myKey);
    if (saved) return setLink(saved);
    setLink("");
    const url = await run(async (say) => (say("Making your link…"), createPotInvite(pot.id, me!)));
    if (url) {
      setLink(url);
      reload();
    }
  }

  async function turnOff() {
    const ok = await run(async () => (await disablePotInvite(pot.id, me!), true));
    if (ok) {
      setLink("");
      setSheet("");
      reload();
    }
  }

  if (party) {
    return (
      <Celebrate
        title="The pot is full!"
        amount={formatMoney(party)}
        subtitle="It's on its way to them. Everyone chipped in."
        shareText="Our family pot just filled up on Kin 🎉"
        onClose={() => setParty(0n)}
      />
    );
  }

  const muted = { color: t.muted, fontSize: 14, textAlign: "center" } as const;
  const close = () => !busy && setSheet("");
  return (
    <Screen title="Family pot" back scroll>
      <View style={{ alignItems: "center", gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {!pot.toAll && <WhoAvatar a={pot.beneficiaries[0]} size={28} />}
          <Text style={{ color: t.muted, fontSize: 14 }}>For <PotFor p={pot} me={me} /></Text>
        </View>
        <BigRing value={pct} label="Filled" />
        <OfGoal have={formatMoney(pot.balance)} goal={formatMoney(pot.target)} />
        {pot.closed ? (
          <Chip>This pot is closed</Chip>
        ) : (
          <Text style={muted}>{formatMoney(left)} to go — then it pays out by itself{split > 1 ? `, split between ${split} people` : ""}.</Text>
        )}
        {payouts.length > 0 && (
          <Chip tone="good">Paid out {payouts.length}× · {formatMoney(payouts.reduce((a, p) => a + p.amount, 0n))} ✓✓</Chip>
        )}
      </View>

      <View>
        <Band>This round</Band>
        {pot.members.map((m) => {
          const put = pot.mine.get(m) ?? 0n;
          return (
            <Row
              key={m}
              icon={<WhoAvatar a={m} size={40} />}
              title={<Who a={m} me={me} />}
              trail={put ? <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: t.good, fontVariant: ["tabular-nums"] }}>+{formatMoney(put)}</Text> : <Chip>Not yet</Chip>}
            />
          );
        })}
      </View>

      <Sheet open={sheet === "chip"} onClose={close}>
        <Serif size={30}>Chip in</Serif>
        <MoneyInput label="Amount" value={amount} onChange={setAmount} hint={`${formatMoney(left)} fills the pot.`} />
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy ? status : ""}</Status>
        <Button title="Add to pot" onPress={chipIn} busy={busy} disabled={!Number(amount)} />
      </Sheet>
      <InviteSheet
        open={sheet === "invite"}
        onClose={close}
        title="Invite family"
        sub="Anyone with your link can join the pot and chip in, up to 20 people. You can turn your link off any time."
        text="Join our family pot on Kin — we chip in together and it pays out by itself. Tap to join:"
        link={link}
        canOff={!!link || myKey !== ZERO}
        onOff={turnOff}
        busy={busy}
        status={status}
        error={actionError}
      />
      <Sheet open={sheet === "close"} onClose={close}>
        <Serif size={30}>{split > 1 ? "Pay out" : "Take"} {formatMoney(pot.balance)} now?</Serif>
        <Text style={{ color: t.muted, fontSize: 16 }}>
          {split > 1 ? `It's split between ${split} people and the pot closes.` : "The pot closes after this."} Family can start a new one any time.
        </Text>
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy ? status : ""}</Status>
        <Button title={split > 1 ? "Pay out and close" : "Take it and close"} onPress={closePot} busy={busy} />
      </Sheet>
      <Footer>
        <ErrorText>{sheet ? "" : actionError}</ErrorText>
        {!pot.closed && iMember && <Button title="Chip in" onPress={() => { setAmount(""); setSheet("chip"); }} />}
        {!pot.closed && iMember && !pot.old && pot.members.length < 20 && <Button title="Invite family" variant="soft" onPress={openInvite} />}
        {!pot.closed && iGet && pot.balance > 0n && (
          <Button title={split > 1 ? "Pay out what's there now" : "Take what's there now"} variant={iMember ? "ghost" : "primary"} onPress={() => setSheet("close")} />
        )}
      </Footer>
    </Screen>
  );
}
