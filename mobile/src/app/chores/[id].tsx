import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import type { Address } from "viem";
import { Kinko } from "@/components/Kinko";
import { dueLabel, useChore, useChoreMeta, type ChoreMeta } from "@/components/programs/chores";
import { Loading, Status, Who, WhoAvatar, dateLabel, useLoad, useMe, useName } from "@/components/programs/kit";
import { Band, Button, Chip, ErrorText, Footer, IconTile, Row, Screen, Serif, Text } from "@/components/ui";
import { ICON, type IconName } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { useAvatarLook } from "@/lib/names";
import { listEscrows, same, type Escrow } from "@/lib/programs";
import { useTheme } from "@/theme";

// Port of app/src/app/chores/[id]/page.tsx.
export default function ChoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const valid = /^\d{1,30}$/.test(id ?? "");
  const { data, error, reload } = useLoad(async () => {
    const { escrows, pinged } = await listEscrows(me!, "chore");
    const e = escrows.find((x) => x.id === BigInt(id));
    return { e, done: !!e && (pinged.get(e.id) ?? 0) > 0 };
  }, me && valid ? `${id}:${me}` : undefined);
  const metaOf = useChoreMeta(data?.e ? [data.e.id] : []);

  // Parent sees the "I did it!" tap without a refresh.
  useEffect(() => {
    const i = setInterval(reload, 8000);
    return () => clearInterval(i);
  }, [reload]);

  const missing = <Screen title="Chore" back><ErrorText>We couldn&apos;t find this chore.</ErrorText></Screen>;
  if (!valid) return missing;
  if (!data) return <Screen title="Chore" back>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  if (!data.e) return missing;
  return <Chore e={data.e} done={data.done} meta={metaOf(data.e.id)} me={me} onDone={reload} />;
}

function Chore({ e, done, meta, me, onDone }: { e: Escrow; done: boolean; meta: ChoreMeta; me?: Address; onDone: () => void }) {
  const t = useTheme();
  const look = useAvatarLook(useName(e.to) ?? "");
  const { busy, status, error, step, act, iDo, said, expired } = useChore(e, me, done, onDone);
  const paid = e.settled && e.approved;
  const other = iDo ? e.from : e.to;
  const chip = busy ? "Working on it…" : e.settled ? step.label : expired ? "Time's up" : said ? (iDo ? "Waiting for OK" : "Done — check it") : "To do";

  type Item = { icon: IconName; title: string; sub: string; on: boolean };
  const items: Item[] = [
    { icon: "post", title: "Posted", sub: `${formatMoney(e.amount)} held safely`, on: true },
    { icon: "check", title: "Done", sub: said || paid ? (iDo ? "You said it's done" : "They said it's done") : "Waiting for “I did it!”", on: said || paid },
    e.settled
      ? paid
        ? { icon: "payout", title: "Paid", sub: iDo ? "It's in your balance" : "Sent from what you set aside", on: true }
        : { icon: "takeBack", title: "Taken back", sub: iDo ? "It went back to them" : "It's back in your balance", on: true }
      : expired
        ? { icon: "schedule", title: "Time's up", sub: same(e.from, me) ? "You can take it back" : "It wasn't OK'd in time", on: true }
        : { icon: "pending", title: "Paid", sub: "Once it gets the OK", on: false },
  ];

  return (
    <Screen title="Chore" back scroll>
      <View style={{ alignItems: "center", gap: 8 }}>
        <Kinko look={look} size={88} mood={paid ? "celebrate" : said ? "happy" : "calm"} />
        <Serif size={30}>{meta.t}</Serif>
        <Serif size={48}>{formatMoney(e.amount)}</Serif>
        <Chip tone={paid ? "good" : said && !e.settled ? "warn" : undefined}>{chip}</Chip>
      </View>

      <Band>Details</Band>
      <Row icon={<WhoAvatar a={other} size={40} />} title={<Who a={other} me={me} />} sub={iDo ? "Posted it" : "Doing it"} />
      {meta.due > 0 && <Row icon={<IconTile icon={ICON.schedule} />} title="Due" trail={<Text style={{ color: t.muted }}>{dueLabel(meta.due)}</Text>} />}
      {!e.settled && <Row icon={<IconTile icon={ICON.safe} />} title="Held safely until" trail={<Text style={{ color: t.muted }}>{dateLabel(e.expiresAt)}</Text>} />}

      <Band>Progress</Band>
      {items.map((s, i) => (
        <Row key={i} icon={<View style={{ opacity: s.on ? 1 : 0.4 }}><IconTile icon={ICON[s.icon]} brand={s.on} /></View>} title={s.title} sub={s.sub} />
      ))}

      <Footer>
        <ErrorText>{error}</ErrorText>
        <Status>{busy ? status : ""}</Status>
        {step.fn && <Button title={step.label} onPress={act} busy={busy} variant={step.brand ? "primary" : "ghost"} />}
      </Footer>
    </Screen>
  );
}
