import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView } from "react-native";
import { Empty, Loading, Sheet, useLoad, useMe } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Avatars, PeopleChips } from "@/components/trips/bits";
import { Button, ErrorText, Field, Footer, IconTile, Row, Screen, Text, TextInput, useInputStyle } from "@/components/ui";
import { humanError } from "@/lib/errors";
import { ICON } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { createTrip, listTrips } from "@/lib/trips";
import { useTheme } from "@/theme";

/** Group trips: who paid what, settled in one tap. */
export default function TripsPage() {
  const t = useTheme();
  const me = useMe();
  const { data: trips, error, reload } = useLoad(listTrips, me);
  const [open, setOpen] = useState(false);
  // Back from a trip: balances may have moved.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is a fresh closure each render
  useFocusEffect(useCallback(() => reload(), []));

  return (
    <Screen title="Trips" back scroll>
      {!!error && <ErrorText>We couldn&apos;t load your trips. Try again soon.</ErrorText>}
      {!trips && !error && <Loading />}
      {trips?.length === 0 && <Empty icon="trip" title="No trips yet" sub="Add everyone once, log costs as you go, settle up at the end." />}
      {trips?.map((trip) => {
        const net = BigInt(trip.net);
        return (
          <Row
            key={trip.id}
            onPress={() => router.push({ pathname: "/trips/[id]", params: { id: trip.id } })}
            icon={<IconTile icon={ICON.trip} />}
            title={trip.name}
            sub={<Avatars people={trip.members} size={22} />}
            trail={
              <Text style={{ textAlign: "right", fontSize: 14, fontWeight: "600", color: net > 0n ? t.good : net < 0n ? t.bad : t.muted }}>
                {net > 0n ? `You're owed\n${formatMoney(net)}` : net < 0n ? `You owe\n${formatMoney(-net)}` : "All settled"}
              </Text>
            }
          />
        );
      })}
      <Footer>
        <Button title="New trip" onPress={() => setOpen(true)} />
      </Footer>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <NewTrip onCreated={(id) => (setOpen(false), router.push({ pathname: "/trips/[id]", params: { id } }))} />
      </Sheet>
    </Screen>
  );
}

function NewTrip({ onCreated }: { onCreated: (id: string) => void }) {
  const t = useTheme();
  const input = useInputStyle();
  const [name, setName] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function add(p: Person | null) {
    if (!p) return;
    setPeople((ps) => (ps.some((x) => x.address === p.address) || ps.length >= 19 ? ps : [...ps, p]));
    setPickerKey((k) => k + 1);
  }

  async function create() {
    setBusy(true);
    setErr("");
    try {
      const { id } = await createTrip(name.trim(), people.map((p) => p.address));
      onCreated(id);
    } catch (e) {
      setErr(humanError(e));
      setBusy(false);
    }
  }

  return (
    <>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>New trip</Text>
        <Field label="Trip name">
          <TextInput style={input} placeholder="Goa with the gang" placeholderTextColor={t.muted} maxLength={60} value={name} onChangeText={setName} />
        </Field>
        <PersonPicker key={pickerKey} label="Who's coming?" onPick={add} exclude={new Set(people.map((p) => p.name))} />
        <PeopleChips label="Coming along" people={people} onRemove={(p) => setPeople((ps) => ps.filter((x) => x.address !== p.address))} />
        <ErrorText>{err}</ErrorText>
      </ScrollView>
      <Button title={people.length ? `Start trip with ${people.length + 1}` : "Start trip"} onPress={create} busy={busy} disabled={!name.trim()} />
    </>
  );
}
