import type { ReactNode } from "react";
import { Lock } from "lucide-react-native";
import { View } from "react-native";
import type { Address } from "viem";
import { Status, Who, timeLeft, dateLabel, useAction, useNow } from "@/components/programs/kit";
import { Card } from "@/components/trips/bits";
import { Button, Chip, ErrorText, IconTile, Serif, Text } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { isBound, refundGift, type GiftLink } from "@/lib/giftLinks";
import { ICON } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { canRelease, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of the GiftCard / GiftLinkCard parts of app/src/app/gift/page.tsx.

function Head({ icon, title, sub, amount, hidden }: { icon: keyof typeof ICON; title: ReactNode; sub: ReactNode; amount: bigint; hidden: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconTile icon={ICON[icon]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.ink, fontWeight: "600" }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 14 }}>{sub}</Text>
      </View>
      {hidden ? <View accessibilityLabel="Hidden until it opens"><Lock color={t.ink} size={24} /></View> : <Serif size={24}>{formatMoney(amount)}</Serif>}
    </View>
  );
}

/** `onOpen` set = my ready gift: "Open gift" hands over to the box arrival (GiftReveal), which moves the money. */
export function GiftCard({ e, me, onOpen, onDone }: { e: Escrow; me?: Address; onOpen?: () => void; onDone: () => void }) {
  const now = useNow();
  const { busy, status, error, run } = useAction();
  const mine = same(e.to, me);
  const locked = now < e.unlockAt;
  const needsOk = e.approver !== ZERO && !e.approved;
  const iGuard = same(e.approver, me) && needsOk && !e.settled;
  const iRefund = same(e.from, me) && !e.settled && !!e.expiresAt && now >= e.expiresAt;

  async function act(fn: "approve" | "refund") {
    const ok = await run(async () => (await call(addr.escrow, KinEscrowAbi, fn, [e.id]), true));
    if (!ok) return;
    if (fn === "approve" && !locked) void recordPayment(e.to, e.amount);
    onDone();
  }

  return (
    <Card brand={mine && !e.settled}>
      <Head
        icon={e.settled ? "celebrate" : locked ? "lock" : "gift"}
        title={mine ? <>From <Who a={e.from} me={me} /></> : <>For <Who a={e.to} me={me} /></>}
        sub={e.settled ? "Opened ✓" : locked ? `Opens ${dateLabel(e.unlockAt)}` : needsOk ? <>Waiting for <Who a={e.approver} me={me} you="your" />{same(e.approver, me) ? "" : "'s"} OK</> : "Ready to open"}
        amount={e.amount}
        hidden={mine && locked && !e.settled}
      />
      {!e.settled && locked && <View style={{ alignItems: "center" }}><Chip>Opens in {timeLeft(e.unlockAt - now)}</Chip></View>}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {mine && canRelease(e, now) && onOpen && <Button title="Open gift" onPress={onOpen} />}
      {iGuard && <Button title={locked ? "OK it for the big day" : "OK it — send now"} variant={locked ? "soft" : "primary"} onPress={() => act("approve")} busy={busy} />}
      {iRefund && <Button title="Take it back" variant="soft" onPress={() => act("refund")} busy={busy} />}
    </Card>
  );
}

/** A dated gift sent as a link: I'm the sender, or it was accepted by me. */
export function GiftLinkCard({ g, me, onOpen, onDone }: { g: GiftLink; me?: Address; onOpen?: () => void; onDone: () => void }) {
  const now = useNow();
  const { busy, status, error, run } = useAction();
  const mine = same(g.recipient, me);
  const locked = now < g.unlockAt;
  const canOpen = mine && !g.settled && !locked;
  const canTakeBack = same(g.from, me) && !g.settled && now >= g.expiresAt;

  async function takeBack() {
    if (await run(async () => (await refundGift(g.id), true))) onDone();
  }

  const sub = mine
    ? g.settled ? "Opened ✓" : locked ? `Opens ${dateLabel(g.unlockAt)}` : "Ready to open"
    : g.settled ? (isBound(g) ? "Opened ✓" : "Back in your balance")
    : isBound(g) ? <>Accepted by <Who a={g.recipient} me={me} /> · opens {dateLabel(g.unlockAt)}</> : "Waiting to be accepted";

  return (
    <Card brand={mine && !g.settled}>
      <Head
        icon={g.settled ? "celebrate" : locked ? "lock" : "gift"}
        title={mine ? <>From <Who a={g.from} me={me} /></> : isBound(g) ? <>For <Who a={g.recipient} me={me} /></> : "Gift link"}
        sub={sub}
        amount={g.amount}
        hidden={mine && locked && !g.settled}
      />
      {mine && !g.settled && locked && <View style={{ alignItems: "center" }}><Chip>Opens in {timeLeft(g.unlockAt - now)}</Chip></View>}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {canOpen && onOpen && <Button title="Open gift" onPress={onOpen} />}
      {canTakeBack && <Button title="Take back" variant="soft" onPress={takeBack} busy={busy} />}
    </Card>
  );
}
