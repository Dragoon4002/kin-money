import { router } from "expo-router";
import { Check, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { Address } from "viem";
import { PctRing } from "@/components/pot/bits";
import { Choice, Empty, Loading, MoneyInput, PotFor, Status, Who, WhoAvatar, useAction, useLoad, useMe, useBack } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Band, Button, ErrorText, Footer, IconTile, Label, Row, Screen, Text } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { ICON } from "@/lib/icons";
import { notifyAdded } from "@/lib/live";
import { formatMoney, fromLocal } from "@/lib/money";
import { keepKey, newKey } from "@/lib/potLinks";
import { createdId, isJar, listOldPots, listPots, potPath, same, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/pot/page.tsx.
export default function PotPage() {
  const t = useTheme();
  const me = useMe();
  const [creating, setCreating] = useState(false);
  // Savings jars are pots too; they live on /jars.
  const { data, error } = useLoad(() => Promise.all([listPots(me!), listOldPots(me!).catch(() => [])]).then(([ps, old]) => [...ps, ...old].filter((p) => !isJar(p))), me);

  if (creating) return <NewPot me={me} onCancel={() => setCreating(false)} />;

  return (
    <Screen title="Family pots" back scroll>
      <Text style={{ color: t.muted, fontSize: 16 }}>Chip in together from anywhere. When the pot is full, it pays out by itself.</Text>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon="pot" title="No pots yet" sub="Brothers and sisters abroad, one pot for Mum's monthly costs." />}
      {!!data?.length && <Band>Your pots</Band>}
      {data?.map((p) => (
        <Row
          key={potPath(p)}
          onPress={() => router.push(`/pot/${potPath(p)}`)}
          icon={p.toAll ? <IconTile icon={ICON.pot} size={44} brand /> : <WhoAvatar a={p.beneficiaries[0]} size={44} />}
          title={<>For <PotFor p={p} me={me} /></>}
          sub={p.closed ? "Closed" : `${formatMoney(p.balance)} of ${formatMoney(p.target)}`}
          trail={!p.closed && <PctRing value={Number(p.balance) / Number(p.target)} />}
        />
      ))}
      <Footer>
        <Button title="Start a pot" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}

type ForWhom = "all" | "some" | "one";

/** Chip of a picked person with a remove button. */
function PersonChip({ a, me, onRemove }: { a: Address; me?: Address; onRemove: () => void }) {
  const t = useTheme();
  return (
    <View style={{ height: 44, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, paddingLeft: 4 }}>
      <WhoAvatar a={a} size={32} />
      <Text style={{ color: t.ink, fontSize: 14, fontWeight: "500" }}><Who a={a} me={me} /></Text>
      <Pressable onPress={onRemove} accessibilityLabel="Remove" accessibilityRole="button" style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}>
        <X color={t.muted} size={16} />
      </Pressable>
    </View>
  );
}

/** Picked people + a picker to add more. */
function People({ list, set, me, label, max = 20 }: { list: Address[]; set: (l: Address[]) => void; me?: Address; label: string; max?: number }) {
  const t = useTheme();
  const [picked, setPicked] = useState<Person | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  function add() {
    if (picked && !list.some((m) => same(m, picked.address))) set([...list, picked.address]);
    setPicked(null);
    setPickerKey((k) => k + 1);
  }
  const off = !picked || list.length >= max;
  return (
    <>
      {list.map((m) => <PersonChip key={m} a={m} me={me} onRemove={() => set(list.filter((x) => x !== m))} />)}
      <View style={{ width: "100%", flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <View style={{ flex: 1 }}><PersonPicker key={pickerKey} label={label} onPick={setPicked} exclude={new Set(list.map((a) => a.toLowerCase()))} /></View>
        <Pressable onPress={add} disabled={off} accessibilityRole="button"
          style={{ height: 56, borderRadius: 28, paddingHorizontal: 20, justifyContent: "center", backgroundColor: t.brandSoft, opacity: off ? 0.4 : 1 }}>
          <Text style={{ color: t.brand, fontWeight: "600", fontSize: 16 }}>Add</Text>
        </Pressable>
      </View>
    </>
  );
}

function NewPot({ me, onCancel }: { me?: Address; onCancel: () => void }) {
  useBack(onCancel);
  const t = useTheme();
  const [mode, setMode] = useState<ForWhom>("one");
  const [one, setOne] = useState<Person | null>(null);
  const [some, setSome] = useState<Address[]>([]);
  const [target, setTarget] = useState("");
  const [others, setOthers] = useState<Address[]>([]);
  const [meToo, setMeToo] = useState(true);
  const { busy, status, error, run } = useAction();
  const value = Number(target) > 0 ? fromLocal(target) : 0n;
  const members = meToo && me ? [me, ...others.filter((m) => !same(m, me))] : others;
  const beneficiaries = mode === "all" ? [] : mode === "one" ? (one ? [one.address] : []) : some;
  const forOk = mode === "all" || beneficiaries.length > 0;
  const creatorOk = meToo || beneficiaries.some((b) => same(b, me));

  async function create() {
    if (!forOk || !value || !members.length || !me) return;
    await run(async (say) => {
      const link = newKey(); // my invite link exists from the start (only members can hold one)
      const hash = await call(addr.pot, KinPotAbi, "create", [beneficiaries, mode === "all", value, members, meToo ? link.address : ZERO]);
      say("Setting up your pot…");
      const id = await createdId(hash, KinPotAbi, "PotCreated");
      if (meToo) keepKey(id, me, link.key);
      notifyAdded("pot", id, members);
      router.replace(`/pot/${id}`);
    });
  }

  const muted = { color: t.muted, fontSize: 14 } as const;
  return (
    <Screen title="New pot" scroll>
      <View style={{ gap: 8 }}>
        <Label>Who is it for?</Label>
        <Choice<ForWhom>
          options={[{ value: "all", label: "Everyone" }, { value: "some", label: "Some people" }, { value: "one", label: "One person" }]}
          value={mode}
          onChange={setMode}
        />
        {mode === "all" && <Text style={muted}>Each payout is split between everyone in the pot, including family who join later.</Text>}
        {mode === "one" && <PersonPicker label="Person" onPick={setOne} />}
        {mode === "some" && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><People list={some} set={setSome} me={me} label="Add a person" /></View>}
        {mode === "some" && some.length > 1 && <Text style={muted}>Each payout is split between {some.length} people.</Text>}
      </View>
      <MoneyInput label="Goal each month" value={target} onChange={setTarget} hint="Paid out the moment the pot reaches it." />
      <View style={{ gap: 8 }}>
        <Label>Who chips in?</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pressable onPress={() => setMeToo(!meToo)} accessibilityRole="button" accessibilityState={{ selected: meToo }}
            style={{ height: 44, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, borderColor: meToo ? t.brand : t.line, backgroundColor: meToo ? t.brandSoft : "transparent" }}>
            {meToo && <Check color={t.brand} size={16} />}
            <Text style={{ color: meToo ? t.brand : t.muted, fontSize: 14, fontWeight: "500" }}>Me</Text>
          </Pressable>
          <People list={others} set={(l) => setOthers(l.filter((m) => !same(m, me)))} me={me} label="Add family" max={meToo ? 19 : 20} />
        </View>
        <Text style={muted}>You can also invite family with a link once the pot is ready.</Text>
      </View>
      <ErrorText>{error || (!creatorOk && forOk ? "Add yourself so you can chip in too." : "")}</ErrorText>
      <Footer>
        <Status>{busy ? status : ""}</Status>
        <Button title="Start pot" onPress={create} busy={busy} disabled={!forOk || !value || !members.length || !creatorOk} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
      </Footer>
    </Screen>
  );
}
