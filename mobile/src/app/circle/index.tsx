import { router } from "expo-router";
import { ChevronUp, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { Address } from "viem";
import { Kinko } from "@/components/Kinko";
import { Choice, Empty, Loading, MoneyInput, Status, Who, WhoAvatar, useAction, useLoad, useMe, useBack } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Band, Button, Chip, ErrorText, Footer, Label, Row, Screen, Serif, Text } from "@/components/ui";
import { KinCircleAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { notifyAdded } from "@/lib/live";
import { formatMoney, fromLocal } from "@/lib/money";
import { circlePhase, createdId, listCircles, same } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/circle/page.tsx.
const ROUND_LENGTHS = [
  { value: 7 * 86_400, label: "Weekly" },
  { value: 30 * 86_400, label: "Monthly" },
  { value: 300, label: "5 min (demo)" },
];

export default function CirclePage() {
  const t = useTheme();
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listCircles(me!), me);

  if (creating) return <NewCircle me={me} onCancel={() => setCreating(false)} />;

  return (
    <Screen title="Savings circles" back scroll>
      <Text style={{ color: t.muted, fontSize: 16 }}>Friends put in the same amount each round. Each round, one person takes it all home.</Text>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon="circle" title="No circles yet" sub="Save together like a chit fund or tanda — Kin keeps everyone's turn fair." />}
      {!!data?.length && <Band>Your circles</Band>}
      {data?.map((c) => {
        const phase = circlePhase(c);
        const turn = c.members[c.round]?.address;
        return (
          <Row
            key={String(c.id)}
            onPress={() => router.push(`/circle/${c.id}`)}
            icon={<Kinko size={44} mood={phase === "running" ? "happy" : "calm"} />}
            title={`${c.seats} people · ${formatMoney(c.contribution)} each`}
            sub={phase === "running" ? <>Turn {c.round + 1}: <Who a={turn} me={me} /></> : `${formatMoney(c.contribution * BigInt(c.seats))} each turn`}
            trail={
              phase === "gathering" ? <Chip tone="brand">{c.joined}/{c.seats} joined</Chip>
                : phase === "stalled" ? <Chip tone="warn">Didn&apos;t start</Chip>
                : phase === "done" ? <Chip tone="good">Finished ✓✓</Chip>
                : <Chip tone="good">Live</Chip>
            }
          />
        );
      })}
      <Footer>
        <Button title="Start a circle" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}

function NewCircle({ me, onCancel }: { me?: Address; onCancel: () => void }) {
  useBack(onCancel);
  const t = useTheme();
  const [others, setOthers] = useState<Address[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [amount, setAmount] = useState("");
  const [length, setLength] = useState(ROUND_LENGTHS[1].value);
  const [seatsWant, setSeatsWant] = useState(0);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const members = me ? [me, ...others] : [];
  // Seats = everyone in the circle; any beyond the picked friends are filled later by invite links.
  const seats = Math.min(20, Math.max(seatsWant, members.length, 2));
  const n = BigInt(seats);

  function add() {
    if (picked && !same(picked.address, me) && !others.some((m) => same(m, picked.address))) setOthers([...others, picked.address]);
    setPicked(null);
    setPickerKey((k) => k + 1);
  }

  function move(i: number, d: -1 | 1) {
    const next = [...others];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOthers(next);
  }

  async function create() {
    if (!me || !value) return;
    await run(async (say) => {
      const hash = await call(addr.circle, KinCircleAbi, "create", [members, seats, value, length]);
      say("Setting up your circle…");
      const id = await createdId(hash, KinCircleAbi, "CircleCreated");
      notifyAdded("circle", id, members);
      router.replace(`/circle/${id}`);
    });
  }

  const pill = { height: 56, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 28, borderWidth: 1, borderColor: t.line, paddingLeft: 12 } as const;
  const small = { color: t.muted, fontSize: 12 } as const;
  const iconBtn = { width: 44, height: 44, alignItems: "center", justifyContent: "center" } as const;
  const stepBtn = (label: string, sign: string, off: boolean, onPress: () => void) => (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} disabled={off} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", opacity: off ? 0.3 : 1 }}>
      <Text style={{ color: t.ink, fontSize: 24, fontWeight: "700" }}>{sign}</Text>
    </Pressable>
  );
  const addOff = !picked || members.length >= 20;

  return (
    <Screen title="New circle" scroll>
      <MoneyInput label="Everyone puts in, each round" value={amount} onChange={setAmount} />
      <View style={{ gap: 6 }}>
        <Label>How often?</Label>
        <Choice options={ROUND_LENGTHS} value={length} onChange={setLength} />
      </View>
      <View style={{ gap: 6 }}>
        <Label>How many people?</Label>
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, paddingHorizontal: 4 }}>
          {stepBtn("Fewer people", "−", seats <= Math.max(members.length, 2), () => setSeatsWant(seats - 1))}
          <Serif size={26}>{seats}</Serif>
          {stepBtn("More people", "+", seats >= 20, () => setSeatsWant(seats + 1))}
        </View>
        {seats > members.length && (
          <Text style={small}>{seats - members.length} open {seats - members.length === 1 ? "spot" : "spots"} — anyone in the circle can fill them with an invite link.</Text>
        )}
      </View>
      <View style={{ gap: 8 }}>
        <Label>Turn order</Label>
        {members.map((m, i) => (
          <View key={m} style={[pill, { backgroundColor: t.surface, paddingRight: 4 }]}>
            <Text style={{ width: 20, textAlign: "center", color: t.muted, fontWeight: "700" }}>{i + 1}</Text>
            <WhoAvatar a={m} size={32} />
            <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontWeight: "500" }}><Who a={m} me={me} /></Text>
            {value > 0n && <Text style={small}>{formatMoney((n - 1n - BigInt(i)) * value)} deposit</Text>}
            {i > 1 && <Pressable accessibilityLabel="Move up" accessibilityRole="button" onPress={() => move(i - 1, -1)} style={iconBtn}><ChevronUp color={t.muted} size={20} /></Pressable>}
            {i > 0 && <Pressable accessibilityLabel="Remove" accessibilityRole="button" onPress={() => setOthers(others.filter((x) => x !== m))} style={iconBtn}><X color={t.muted} size={20} /></Pressable>}
          </View>
        ))}
        {Array.from({ length: seats - members.length }, (_, k) => members.length + k).map((i) => (
          <View key={`open${i}`} style={[pill, { borderStyle: "dashed", paddingRight: 16 }]}>
            <Text style={{ width: 20, textAlign: "center", color: t.muted, fontWeight: "700" }}>{i + 1}</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: t.muted }}>Open spot · whoever joins next</Text>
            {value > 0n && <Text style={small}>{formatMoney((n - 1n - BigInt(i)) * value)} deposit</Text>}
          </View>
        ))}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <View style={{ flex: 1 }}><PersonPicker key={pickerKey} label="Add a friend" onPick={setPicked} /></View>
          <Pressable onPress={add} disabled={addOff} accessibilityRole="button"
            style={{ height: 56, borderRadius: 28, paddingHorizontal: 20, justifyContent: "center", backgroundColor: t.brandSoft, opacity: addOff ? 0.4 : 1 }}>
            <Text style={{ color: t.brand, fontWeight: "600", fontSize: 16 }}>Add</Text>
          </Pressable>
        </View>
      </View>
      {value > 0n && (
        <Text style={{ color: t.muted, fontSize: 14, backgroundColor: t.surface, borderRadius: 28, padding: 20 }}>
          Each round someone takes home <Text style={{ color: t.ink, fontWeight: "700" }}>{formatMoney(n * value)}</Text>. A small safety deposit keeps everyone honest — earlier turns put down a bigger one, and it&apos;s returned at the end.
        </Text>
      )}
      <ErrorText>{error}</ErrorText>
      <Footer>
        <Status>{busy ? status : ""}</Status>
        <Button title="Start circle" onPress={create} busy={busy} disabled={!me || !value} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
      </Footer>
    </Screen>
  );
}
