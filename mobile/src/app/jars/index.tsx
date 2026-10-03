import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { Address } from "viem";
import { PctRing } from "@/components/pot/bits";
import { Empty, Loading, MoneyInput, OldPots, Status, jarKey, jarMeta, setMeta, useAction, useLoad, useMe, useBack } from "@/components/programs/kit";
import { Band, Button, ErrorText, Field, Footer, IconTile, Row, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { ICON, type IconName } from "@/lib/icons";
import { formatMoney, fromLocal } from "@/lib/money";
import { createdId, isJar, listPots, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/jars/page.tsx. Savings jars: a KinPot where I'm the only member and the beneficiary.
// When the jar hits its goal, the pot pays the goal back to me (PotPaid) — the "goal reached" moment.
export default function JarsPage() {
  const t = useTheme();
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listPots(me!).then((ps) => ps.filter((p) => isJar(p) && !p.closed)), me);

  if (creating) return <NewJar me={me} onCancel={() => setCreating(false)} />;
  const saved = data?.reduce((a, p) => a + p.balance, 0n) ?? 0n;

  return (
    <Screen title="Savings jars" back scroll>
      <View style={{ alignItems: "center", gap: 8 }}>
        <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase" }}>Saved so far</Text>
        {data ? <Serif size={56}>{formatMoney(saved)}</Serif> : <View style={{ height: 56, width: 160, borderRadius: 16, backgroundColor: t.surface2 }} />}
      </View>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon="jars" title="No jars yet" sub="Saving for a bike, a trip or a phone? Give it a jar and watch it fill." />}
      {!!data?.length && <Band>Your jars</Band>}
      {data?.map((p) => {
        const { name, icon } = jarMeta(p.id);
        return (
          <Row
            key={String(p.id)}
            onPress={() => router.push(`/jars/${p.id}`)}
            icon={<IconTile icon={ICON[icon]} />}
            title={name}
            sub={p.round > 0n ? <Text style={{ color: t.good, fontWeight: "600" }}>Goal reached ✓✓</Text> : `${formatMoney(p.balance)} of ${formatMoney(p.target)}`}
            trail={<PctRing value={Number(p.balance) / Number(p.target)} />}
          />
        );
      })}
      <OldPots me={me} jars />
      <Footer>
        <Button title="New jar" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}

const GOALS: [IconName, string][] = [
  ["jars", "Savings"], ["travel", "Travel"], ["education", "Study"], ["gifts", "Gifts"], ["rent", "Home"], ["shopping", "Shopping"], ["other", "Other"],
];

function NewJar({ me, onCancel }: { me?: Address; onCancel: () => void }) {
  useBack(onCancel);
  const t = useTheme();
  const input = useInputStyle();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IconName>("jars");
  const [goal, setGoal] = useState("");
  const { busy, status, error, run } = useAction();
  const value = Number(goal) > 0 ? fromLocal(goal) : 0n;
  const n = name.trim();

  async function create() {
    if (!me || !n || !value) return;
    await run(async (say) => {
      const hash = await call(addr.pot, KinPotAbi, "create", [[me], false, value, [me], ZERO]);
      say("Setting up your jar…");
      const id = await createdId(hash, KinPotAbi, "PotCreated");
      setMeta(jarKey(id), { name: n, emoji: icon }); // `emoji` key kept so old jars still load
      router.replace(`/jars/${id}`);
    });
  }

  return (
    <Screen title="New jar" scroll>
      <View style={{ alignSelf: "center" }}><IconTile icon={ICON[icon]} size={96} brand /></View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Pick an icon" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
        {GOALS.map(([k, label]) => {
          const on = k === icon;
          const Icon = ICON[k];
          return (
            <Pressable key={k} onPress={() => setIcon(k)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}
              style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.ink : t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <Icon color={on ? t.bg : t.ink} size={22} />
            </Pressable>
          );
        })}
      </View>
      <Field label="What are you saving for?">
        <TextInput style={input} placeholder="New bike" placeholderTextColor={t.muted} value={name} maxLength={30} onChangeText={setName} />
      </Field>
      <MoneyInput label="Goal" value={goal} onChange={setGoal} hint="When the jar is full, the money lands in your balance." />
      <ErrorText>{error}</ErrorText>
      <Footer>
        <Status>{busy ? status : ""}</Status>
        <Button title="Start saving" onPress={create} busy={busy} disabled={!n || !value} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
      </Footer>
    </Screen>
  );
}
