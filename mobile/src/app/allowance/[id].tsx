import { useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { Address } from "viem";
import { Card, DoneNote } from "@/components/allowance/bits";
import { Loading, MoneyInput, Sheet, Status, Who, WhoAvatar, dateLabel, localParts, useAction, useLoad, useMe } from "@/components/programs/kit";
import { Band, Button, Chip, ErrorText, Footer, Row, Screen, Serif, Text } from "@/components/ui";
import { KinEscrowAbi, KinStreamAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { ICON } from "@/lib/icons";
import { formatMoney, fromLocal } from "@/lib/money";
import { accrued, expiryAfter, getStream, listEscrows, nowSec, same, vestedAt, ZERO, type Escrow, type Stream } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/allowance/[id]/page.tsx.

export default function AllowanceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const valid = /^\d+$/.test(id ?? "");
  const { data, error, reload } = useLoad(async () => {
    const s = await getStream(BigInt(id));
    const { escrows, pinged } = await listEscrows(me!, "reserve");
    const reserve = escrows.find((e) => !e.settled && same(e.from, s.payer) && same(e.to, s.payee));
    return { s, reserve, asked: reserve ? (pinged.get(reserve.id) ?? 0) > 0 : false };
  }, me && valid ? `${id}:${me}` : undefined);

  // Parent's screen notices an emergency ask without a refresh.
  useEffect(() => {
    const i = setInterval(reload, 8000);
    return () => clearInterval(i);
  }, [reload]);

  if (!valid) return <Screen title="Allowance" back><ErrorText>We couldn&apos;t find this allowance.</ErrorText></Screen>;
  if (!data) return <Screen title="Allowance" back>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { s, reserve, asked } = data;
  if (s.payer === ZERO) return <Screen title="Allowance" back><ErrorText>We couldn&apos;t find this allowance.</ErrorText></Screen>;
  const isPayer = same(s.payer, me);
  const other = isPayer ? s.payee : s.payer;

  return (
    <Screen title="Live allowance" back scroll>
      <Ticker s={s} isPayer={isPayer} />
      <Band>Details</Band>
      <Row icon={<WhoAvatar a={other} size={40} />} title={<Who a={other} me={me} />} sub={isPayer ? "Gets this allowance" : "Sends you this allowance"} />
      <Row title="Total" trail={<Serif size={24}>{formatMoney(s.amount)}</Serif>} />
      <Row title={nowSec() < s.end ? "Grows until" : "Ended"} trail={<Muted>{dateLabel(s.end)}</Muted>} />
      <Emergency s={s} me={me} reserve={reserve} asked={asked} isPayer={isPayer} onDone={reload} />
      <Actions s={s} isPayer={isPayer} onDone={reload} />
    </Screen>
  );
}

function Muted({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ color: t.muted }}>{children}</Text>;
}

/** Balance that visibly grows, ~10 times a second. */
function Ticker({ s, isPayer }: { s: Stream; isPayer: boolean }) {
  const t = useTheme();
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now() / 1000), 100);
    return () => clearInterval(i);
  }, []);
  const vested = vestedAt(s, now);
  const p = localParts(Math.max(0, vested - Number(s.withdrawn)));
  const live = now < s.end;
  const pct = Math.min(100, (vested / Number(s.amount)) * 100);

  return (
    <View style={{ alignItems: "center", gap: 16, paddingTop: 8, paddingBottom: 16 }}>
      <View style={{ alignSelf: "center" }}>
        <Chip good={live}>{live ? "● " : ""}{isPayer ? "Ready for them to collect" : "Ready for you to collect"}</Chip>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }} accessible accessibilityLabel={p.main}>
        <Serif size={64}>{p.main}</Serif>
        {live && <Text style={{ marginLeft: 4, marginTop: 4, color: t.muted, fontSize: 16, fontWeight: "500", fontVariant: ["tabular-nums"] }}>{p.tail}</Text>}
      </View>
      <View style={{ height: 6, width: "100%", maxWidth: 288, borderRadius: 3, overflow: "hidden", backgroundColor: t.surface2 }}>
        <View style={{ height: "100%", width: `${pct}%`, borderRadius: 3, backgroundColor: t.good }} />
      </View>
      <Text style={{ color: t.muted, fontSize: 14 }}>{live ? "Grows every second" : "All paid out"}</Text>
    </View>
  );
}

function Actions({ s, isPayer, onDone }: { s: Stream; isPayer: boolean; onDone: () => void }) {
  const t = useTheme();
  const { busy, status, error, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState("");
  const [split, setSplit] = useState({ keep: 0n, back: 0n });
  const open = s.withdrawn < s.amount;

  async function collect() {
    const amt = accrued(s);
    const ok = await run(async (say) => {
      await call(addr.stream, KinStreamAbi, "withdraw", [s.id]);
      say("Moving it to your balance…");
      return true;
    });
    if (ok) {
      setDone(`${formatMoney(amt)} added to your balance ✓✓`);
      onDone();
    }
  }

  async function stop() {
    const ok = await run(async () => {
      await call(addr.stream, KinStreamAbi, "cancel", [s.id]);
      return true;
    });
    setConfirm(false);
    if (ok) {
      void recordPayment(s.payee, split.keep);
      setDone(`Stopped. ${formatMoney(split.back)} is back in your balance ✓✓`);
      onDone();
    }
  }

  function askStop() {
    const keep = accrued(s, nowSec());
    setSplit({ keep, back: s.amount - (s.withdrawn + keep) });
    setConfirm(true);
  }

  return (
    <Footer>
      <DoneNote>{done}</DoneNote>
      <ErrorText>{error}</ErrorText>
      <Status>{busy && !confirm && status}</Status>
      {!isPayer && open && <Button title="Collect" onPress={collect} busy={busy} />}
      {isPayer && open && nowSec() < s.end && <Button title="Stop allowance" variant="ghost" onPress={askStop} disabled={busy} />}
      <Sheet open={confirm} onClose={() => !busy && setConfirm(false)}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>Stop this allowance?</Text>
        <Text style={{ color: t.muted }}>They keep {formatMoney(split.keep)} they&apos;ve already got. You get {formatMoney(split.back)} back, right away.</Text>
        <Status>{busy && status}</Status>
        <Button title={`Stop and get ${formatMoney(split.back)} back`} onPress={stop} busy={busy} />
        <Button title="Keep it going" variant="ghost" onPress={() => setConfirm(false)} disabled={busy} />
      </Sheet>
    </Footer>
  );
}

/** Emergency reserve: parent sets money aside; kid asks; parent sends with one Face ID. */
function Emergency({ s, me, reserve, asked, isPayer, onDone }: { s: Stream; me?: Address; reserve?: Escrow; asked: boolean; isPayer: boolean; onDone: () => void }) {
  const t = useTheme();
  const { busy, status, error, run } = useAction();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const Siren = ICON.emergency;
  const head = (children: ReactNode, big?: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Siren color={t.ink} size={20} strokeWidth={1.75} />
      <Text style={{ flex: 1, color: t.ink, fontSize: big ? 18 : 16, fontWeight: big ? "700" : "600" }}>{children}</Text>
    </View>
  );
  const muted = { color: t.muted, fontSize: 14 } as const;

  async function setAside() {
    const value = fromLocal(amount);
    if (!value) return;
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, "create", [s.payee, ZERO, me!, 0, expiryAfter(nowSec()), 0], { fund: value });
      say("Setting it aside…");
      return true;
    });
    if (ok) {
      setAmount("");
      onDone();
    }
  }

  async function ask() {
    const ok = await run(async () => {
      await call(addr.escrow, KinEscrowAbi, "ping", [reserve!.id]);
      return true;
    });
    if (ok) {
      setNote("asked");
      onDone();
    }
  }

  async function sendNow() {
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, "approve", [reserve!.id]);
      say("Sending…");
      return true;
    });
    if (ok) {
      void recordPayment(s.payee, reserve!.amount);
      setNote("sent");
      onDone();
    }
  }

  if (note === "sent") return <DoneNote>Emergency money delivered ✓✓</DoneNote>;

  if (isPayer && !reserve) {
    return (
      <Card>
        {head("Emergency fund")}
        <Text style={muted}>
          Put some aside that <Who a={s.payee} me={me} /> can ask for in a pinch. You send it with one Identity check. Unused, it comes back to you in 30 days.
        </Text>
        <MoneyInput label="Amount" value={amount} onChange={setAmount} />
        <ErrorText>{error}</ErrorText>
        <Status>{busy && status}</Status>
        <Button title="Set aside" variant="soft" onPress={setAside} busy={busy} disabled={!Number(amount)} />
      </Card>
    );
  }

  if (!reserve) return null;

  if (isPayer) {
    return (
      <Card hot={asked}>
        {asked ? (
          <>
            {head(<><Who a={s.payee} me={me} /> needs help</>, true)}
            <Text style={muted}>They asked for the emergency fund.</Text>
          </>
        ) : (
          <>
            {head("Emergency fund")}
            <Text style={muted}>{formatMoney(reserve.amount)} held safely. <Who a={s.payee} me={me} /> can ask for it any time.</Text>
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <Status>{busy && status}</Status>
        <Button title={`Send ${formatMoney(reserve.amount)} now`} variant={asked ? "primary" : "soft"} onPress={sendNow} busy={busy} />
      </Card>
    );
  }

  const waiting = asked || note === "asked";
  return (
    <Card>
      {head(`${formatMoney(reserve.amount)} emergency fund`)}
      {waiting ? (
        <Text style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontWeight: "600", color: t.warn, backgroundColor: `${t.warn}1a` }}>
          <Who a={s.payer} me={me} /> has been asked. It arrives the moment they tap send.
        </Text>
      ) : (
        <Text style={muted}>Only for real emergencies. <Who a={s.payer} me={me} /> gets a nudge and sends it with one tap.</Text>
      )}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {!waiting && <Button title="I need it now" onPress={ask} busy={busy} />}
    </Card>
  );
}
