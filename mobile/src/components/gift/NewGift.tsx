import { useEffect, useState } from "react";
import { BackHandler, Linking, View } from "react-native";
import type { Address } from "viem";
import { Choice, MoneyInput, Status, WhoAvatar, dateLabel, share, useAction, useNow } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { DateField, Delivered } from "@/components/trips/bits";
import { Button, ErrorText, Field, Footer, IconTile, Label, Screen, Text, TextInput, useInputStyle } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { createGiftLink } from "@/lib/giftLinks";
import { ICON } from "@/lib/icons";
import { formatMoney, fromLocal } from "@/lib/money";
import { expiryAfter, nowSec, same, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of NewGift in app/src/app/gift/page.tsx.

const MODES = [{ value: "name", label: "To a Kin name" }, { value: "link", label: "As a gift link" }] as const;
const WHEN = [{ value: "date", label: "Pick a date" }, { value: "demo", label: "In 2 min (demo)" }] as const;

export function NewGift({ me, onClose }: { me?: Address; onClose: () => void }) {
  const t = useTheme();
  const input = useInputStyle();
  const [mode, setMode] = useState<"name" | "link">("name");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [to, setTo] = useState<Person | null>(null);
  const [guard, setGuard] = useState<Person | null>(null);
  const [amount, setAmount] = useState("");
  const [when, setWhen] = useState<"date" | "demo">("date");
  const [date, setDate] = useState("");
  const [done, setDone] = useState(0);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const selfGuard = same(guard?.address, me);
  const tomorrow = new Date((useNow(60_000) + 86_400) * 1000).toISOString().slice(0, 10);

  // Hardware back closes the form, like the web Cancel.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (onClose(), true));
    return () => sub.remove();
  }, [onClose]);

  async function send() {
    const unlockAt = when === "demo" ? nowSec() + 120 : Math.floor(new Date(`${date}T09:00`).getTime() / 1000);
    if (mode === "link") {
      if (!value || !unlockAt) return;
      const url = await run(async (say) => {
        const r = await createGiftLink(value, unlockAt, message);
        say("Wrapping your gift…");
        return r.url;
      });
      if (!url) return;
      setLink(url);
      setDone(unlockAt);
      return;
    }
    if (!to || !value || !unlockAt || selfGuard) return;
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, "create", [to.address, ZERO, guard?.address ?? ZERO, unlockAt, guard ? expiryAfter(unlockAt) : 0, 0], { fund: value });
      say("Wrapping your gift…");
      return true;
    });
    if (ok) {
      void recordPayment(to.address, value);
      setDone(unlockAt);
    }
  }

  if (done && link) {
    const text = `I wrapped a gift for you on Kin 🎁${message.trim() ? ` "${message.trim()}"` : ""} It opens on ${dateLabel(done)}. Tap to accept it:`;
    return (
      <Screen>
        <Delivered title="Gift link ready" subtitle={`${formatMoney(value)} opens on ${dateLabel(done)}. The first person to accept it keeps it — send it only to them.`} />
        <Footer>
          <Button title="Send on WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`).catch(() => share(text, link))} />
          <Button title="Share another way" variant="soft" onPress={() => void share(text, link)} />
          <Button title="Done" variant="soft" onPress={onClose} />
        </Footer>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <Delivered title="Gift wrapped" subtitle={`@${to!.name} can open it on ${dateLabel(done)}${guard ? ` once @${guard.name} OKs it` : ""}. Until then it's held safely.`} />
        <Footer>
          <Button title="Done" onPress={onClose} />
        </Footer>
      </Screen>
    );
  }

  return (
    <Screen title="Send a gift" scroll>
      <Choice options={[...MODES]} value={mode} onChange={setMode} />
      <View style={{ alignItems: "center", paddingVertical: 8 }}>
        {to && mode === "name" ? <WhoAvatar a={to.address} size={64} /> : <IconTile icon={ICON.gift} size={64} brand />}
      </View>
      {mode === "name" && <PersonPicker label="Who is it for?" onPick={setTo} />}
      <MoneyInput label="Amount" value={amount} onChange={setAmount} />
      <View style={{ gap: 6 }}>
        <Label>When can they open it?</Label>
        <Choice options={[...WHEN]} value={when} onChange={setWhen} />
      </View>
      {when === "date" && <DateField label="Opens on" min={tomorrow} value={date} onChange={setDate} />}
      {mode === "name" ? (
        <View style={{ gap: 6 }}>
          <PersonPicker label="Someone to OK it first? (optional)" onPick={setGuard} />
          <Text style={{ color: t.muted, fontSize: 12 }}>{selfGuard ? "Pick someone else — or leave it empty." : "E.g. a parent who confirms they graduated."}</Text>
        </View>
      ) : (
        <Field label="Message (optional)" hint="For someone not on Kin yet. They accept it now, it opens on the day.">
          <TextInput style={input} value={message} onChangeText={setMessage} maxLength={120} placeholder="Happy birthday!" placeholderTextColor={t.muted} />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
      <Footer>
        <Status>{busy && status}</Status>
        <Button title={value ? `Wrap ${formatMoney(value)}` : "Wrap gift"} onPress={send} busy={busy}
          disabled={!value || (mode === "name" && (!to || selfGuard)) || (when === "date" && !date)} />
        <Button title="Cancel" variant="ghost" onPress={onClose} />
      </Footer>
    </Screen>
  );
}
