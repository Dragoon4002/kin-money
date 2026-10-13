// Port of web components/gift/GiftWrap.tsx (kd-gift in globals.css). Send a gift: the note IS the form (who, amount,
// message on the paper; date below) → Send gift → it folds, drops into the box, the lid goes on → the box HOLDS closed
// until `send` resolves (the gift is held onchain) → lifts and flies off → "The gift will reach @x" + countdown.
// `send` throws → the note opens again with the error. "Someone to OK it" (guardian) hidden for now (user, Oct 13).
import { Gift, Share2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { BackHandler, Keyboard, Linking, Pressable, View } from "react-native";
import Animated, { Easing, FadeInDown, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, ZoomIn, type SharedValue, type WithTimingConfig } from "react-native-reanimated";
import { Countdown } from "@/components/circle/Table";
import { Choice, dateLabel, share, useNow } from "@/components/programs/kit";
import { DateField } from "@/components/trips/bits";
import { Avatar, Button, ErrorText, Footer, Screen, Serif, Text } from "@/components/ui";
import { humanError } from "@/lib/errors";
import { useTheme } from "@/theme";
import { Bow, BoxFront, boxColors, Note, NOTE_W, noteMoney, Ribbon, type GiftDraft, type GiftMode } from "./GiftNote";

const MODES = [{ value: "name", label: "To a Kin name" }, { value: "link", label: "As a gift link" }] as const;
const PHASES = ["note", "fold", "box", "closed", "lift", "fly", "done"] as const;
type WrapPhase = (typeof PHASES)[number];
/** ms in each phase before the next; "closed" also waits for the gift to be held. */
const HOLD: Partial<Record<WrapPhase, number>> = { fold: 760, box: 620, closed: 700, lift: 240, fly: 560 };
const SLOW_MS = 2500;
const at9 = (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const day = (t: number) => { const d = new Date(t * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const B = Easing.bezier;
type Ease = NonNullable<WithTimingConfig["easing"]>;

type Props = {
  from: string;
  /** Kin names starting with `prefix` (autocomplete). */
  suggest: (prefix: string) => string[];
  /** Before folding: error copy (e.g. "No one on Kin with that name yet.") or null. */
  check?: (d: GiftDraft) => Promise<string | null>;
  /** Hold the gift onchain; resolves with the share URL for a gift link. Throws → note opens again. */
  send: (d: GiftDraft, opensAt: number) => Promise<string | void>;
  onClose: () => void;
};

export function GiftWrap({ from, suggest, check, send, onClose }: Props) {
  const t = useTheme();
  const now = useNow();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<WrapPhase>("note");
  const [d, setD] = useState<GiftDraft>({ mode: "name", to: "", amount: "", msg: "", from });
  const set = (p: Partial<GiftDraft>) => setD((x) => ({ ...x, ...p }));
  const [when, setWhen] = useState<"date" | "soon">("date");
  const [date, setDate] = useState("");
  const [toFocus, setToFocus] = useState(false);
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [held, setHeld] = useState(false);
  const [slow, setSlow] = useState(false);
  const [opensAt, setOpensAt] = useState(0); // fixed at the tap, so "in 2 min" counts from then
  const [link, setLink] = useState("");

  useEffect(() => {
    const ms = HOLD[phase];
    if (!ms || (phase === "closed" && !held)) return;
    const id = setTimeout(() => setPhase(PHASES[PHASES.indexOf(phase) + 1]), ms);
    return () => clearTimeout(id);
  }, [phase, held]);
  useEffect(() => {
    if (phase !== "closed" || held) return;
    const id = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(id);
  }, [phase, held]);

  const editing = phase === "note";
  // Hardware back = Cancel while editing / Done at the end; ignored while the gift is being wrapped.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => ((editing || phase === "done") && onClose(), true));
    return () => sub.remove();
  }, [editing, phase, onClose]);

  // Motion (web transitions on data-phase): fold is inside <Note>; box, note-into-box, lid + bow, lift/fly here.
  const boxO = useSharedValue(0), boxY = useSharedValue(70), drop = useSharedValue(0), lidO = useSharedValue(0), lid = useSharedValue(0), bow = useSharedValue(0), fly = useSharedValue(0);
  useEffect(() => {
    const i = PHASES.indexOf(phase);
    const go = (v: SharedValue<number>, to: number, duration: number, easing: Ease, delay = 0) =>
      v.set(reduced ? to : withDelay(delay, withTiming(to, { duration, easing })));
    const folded = i >= 1, inBox = i >= 2 && i <= 5, closed = i >= 3 && i <= 5;
    go(boxO, +folded, 260, Easing.out(Easing.ease), 520);
    go(boxY, folded ? 0 : 70, 360, B(0.2, 0.9, 0.3, 1.15), 520);
    go(drop, +inBox, 480, B(0.55, 0, 0.8, 0.3));
    go(lidO, +closed, 120, Easing.out(Easing.ease));
    go(lid, +closed, 340, B(0.3, 1.25, 0.55, 1));
    go(bow, +closed, 300, B(0.3, 1.6, 0.5, 1), closed ? 300 : 0);
    if (phase === "fly") go(fly, 2, 560, B(0.55, 0, 0.9, 0.35));
    else go(fly, phase === "lift" ? 1 : 0, 240, Easing.out(Easing.ease));
  }, [phase, reduced, boxO, boxY, drop, lidO, lid, bow, fly]);
  const flyStyle = useAnimatedStyle(() => {
    const f = fly.get();
    return { transform: [{ translateX: interpolate(f, [0, 1, 2], [0, 0, 40]) }, { translateY: interpolate(f, [0, 1, 2], [0, -26, -760]) },
      { rotate: `${interpolate(f, [0, 1, 2], [0, -4, -16])}deg` }, { scale: interpolate(f, [0, 1, 2], [1, 1.04, 0.5]) }] };
  });
  const boxStyle = useAnimatedStyle(() => ({ opacity: boxO.get(), transform: [{ translateY: boxY.get() }] }));
  const noteStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 205 * drop.get() }, { scale: 1 - 0.4 * drop.get() }, { rotate: `${-3 * drop.get()}deg` }] }));
  const lidStyle = useAnimatedStyle(() => ({ opacity: lidO.get(), transform: [{ translateY: -150 * (1 - lid.get()) }, { rotate: `${-10 * (1 - lid.get())}deg` }] }));
  const bowStyle = useAnimatedStyle(() => ({ transform: [{ scale: bow.get() }] }));

  const name = d.mode === "name";
  const hits = editing && name && toFocus && d.to ? suggest(d.to).filter((p) => p !== d.to && p !== from).slice(0, 4) : [];
  const opens = when === "soon" ? now + 120 : date ? Math.floor(new Date(`${date}T09:00`).getTime() / 1000) : 0;
  const ok = Number(d.amount) > 0 && (!name || d.to.length >= 3) && opens > now;
  const c = boxColors(t.brand);

  async function go() {
    Keyboard.dismiss();
    setErr("");
    if (check) {
      setChecking(true);
      const e = await check(d).catch((x) => humanError(x));
      setChecking(false);
      if (e) return setErr(e);
    }
    setOpensAt(opens);
    setHeld(false);
    setSlow(false);
    setPhase(reduced ? "closed" : "fold");
    try {
      setLink((await send(d, opens)) || "");
      setHeld(true);
      if (reduced) setPhase("done");
    } catch (e) {
      setErr(humanError(e));
      setPhase("note");
    }
  }

  if (phase === "done") return <OnItsWay mode={d.mode} to={d.to} msg={d.msg} opens={opensAt || opens} link={link} onDone={onClose} />;
  return (
    <Screen title="Send a gift" scroll>
      <View pointerEvents={editing ? "auto" : "none"} style={{ opacity: editing ? 1 : 0 }}>
        <Choice options={[...MODES]} value={d.mode} onChange={(mode: GiftMode) => set({ mode })} />
      </View>
      <View style={{ width: NOTE_W, height: 470, alignSelf: "center", zIndex: 1 }}>
        <Animated.View pointerEvents="box-none" style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, transformOrigin: "50% 85%" }, flyStyle]}>
          <Animated.View pointerEvents="none" style={[{ position: "absolute", zIndex: 1, top: 300, left: 40, width: 200, height: 30, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: c.inside }, boxStyle]} />
          <Animated.View pointerEvents="box-none" style={[{ position: "absolute", zIndex: 2, top: 0, left: 0 }, noteStyle]}>
            {/* Blur hides the list a beat late, so a tap on a suggestion still lands. */}
            <Note d={d} set={editing ? set : undefined} onTo={(f) => (f ? setToFocus(true) : setTimeout(() => setToFocus(false), 200))} folded={!editing}
              label={`Gift note: ${noteMoney(d.amount)} for ${name ? `@${d.to}` : "whoever accepts it"}`} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[{ position: "absolute", zIndex: 3, top: 322, left: 40, width: 200, height: 140 }, boxStyle]}><BoxFront brand={c.front} /></Animated.View>
          <Animated.View pointerEvents="none" style={[{ position: "absolute", zIndex: 4, top: 282, left: 29, width: 222, height: 44, borderRadius: 8, backgroundColor: c.lid, boxShadow: "0 3px 0 rgba(0,0,0,0.12)" }, lidStyle]}>
            <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderRadius: 8, overflow: "hidden" }}><Ribbon /></View>
            <Animated.View style={[{ position: "absolute", left: 69, bottom: 36, transformOrigin: "50% 90%" }, bowStyle]}><Bow /></Animated.View>
          </Animated.View>
        </Animated.View>
        {hits.length > 0 && (
          // Floats over the note; never resizes it.
          <View accessibilityLabel="Suggestions" style={{ position: "absolute", zIndex: 20, left: 16, right: 16, top: 100, overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, boxShadow: "0 10px 20px rgba(0,0,0,0.18)" }}>
            {hits.map((p) => (
              <Pressable key={p} accessibilityRole="button" onPress={() => (set({ to: p }), setToFocus(false), Keyboard.dismiss())}
                style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? t.surface2 : "transparent" })}>
                <Avatar name={p} size={32} />
                <Text style={{ color: t.ink, fontWeight: "600" }}>@{p}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {editing && (
          // Sits where the box lands later (hidden until then).
          <View style={{ position: "absolute", zIndex: 10, top: 346, left: 0, right: 0, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <View style={{ flex: 1 }}>
              {when === "date" ? <DateField label="Opens on" min={day(now + 86_400)} value={date} onChange={setDate} />
                : <View style={{ height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: t.surface2 }}><Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>Opens in 2 min</Text></View>}
            </View>
            <Pressable accessibilityRole="button" onPress={() => setWhen(when === "date" ? "soon" : "date")}
              style={({ pressed }) => ({ height: 56, borderRadius: 28, paddingHorizontal: 16, justifyContent: "center", borderWidth: 1, borderColor: t.line, backgroundColor: pressed ? t.surface2 : "transparent" })}>
              <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>{when === "date" ? "In 2 min" : "Pick a date"}</Text>
            </Pressable>
          </View>
        )}
      </View>
      <Footer>
        {editing ? (
          <>
            <ErrorText>{err}</ErrorText>
            <Button title="Send gift" disabled={!ok} busy={checking} onPress={go} />
            <Button title="Cancel" variant="ghost" onPress={onClose} />
          </>
        ) : (
          <Text accessibilityLiveRegion="polite" style={{ minHeight: 56, textAlign: "center", color: t.muted, fontSize: 14 }}>
            {slow ? "Almost there…" : phase === "fold" ? "Folding your note…" : "Wrapping your gift…"}
          </Text>
        )}
      </Footer>
    </Screen>
  );
}

/** After the box flies off: who it reaches, a countdown to the day, and exactly what happens if it isn't opened. */
function OnItsWay({ mode, to, msg, opens, link, onDone }: { mode: GiftMode; to: string; msg: string; opens: number; link: string; onDone: () => void }) {
  const t = useTheme();
  const now = useNow();
  const back = dateLabel(opens + 60 * 86_400);
  const text = `I wrapped a gift for you on Kin 🎁${msg.trim() ? ` "${msg.trim()}"` : ""} It opens on ${dateLabel(opens)}. Tap to accept it:`;
  const rise = (ms: number) => FadeInDown.delay(ms).duration(400);
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: t.brandSoft }}>
          <Gift color={t.brand} size={36} />
        </Animated.View>
        <Animated.View entering={rise(120)}>
          <Serif size={36}>{mode === "link" ? "The gift will reach whoever you send it to" : `The gift will reach @${to}`}</Serif>
        </Animated.View>
        <Animated.View entering={rise(220)} style={{ alignItems: "center", gap: 8 }}>
          <Text style={{ color: t.muted, fontSize: 14 }}>Opens in</Text>
          <Countdown seconds={opens - now} />
        </Animated.View>
        <Animated.View entering={rise(320)}>
          <Text style={{ color: t.muted, fontSize: 16, textAlign: "center" }}>
            {mode === "link" ? `The first person to accept the link keeps it. It opens on ${dateLabel(opens)} at ${at9(opens)}.` : `It opens by itself on ${dateLabel(opens)} at ${at9(opens)}.`}
          </Text>
        </Animated.View>
        <Animated.View entering={rise(400)}>
          <Text style={{ color: t.ink, fontSize: 14, textAlign: "center", borderRadius: 28, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: t.surface2, overflow: "hidden" }}>
            {mode === "name" ? `It's @${to}'s now, so it can't come back to you.` : `If nobody accepts it by ${back}, you can take the money back in Gifts.`}
          </Text>
        </Animated.View>
      </View>
      <Animated.View entering={rise(500)}>
        <Footer>
          {mode === "link" ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`).catch(() => share(text, link))}
                style={({ pressed }) => ({ height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: t.good, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <Share2 color="#0d0c0b" size={20} />
                <Text style={{ color: "#0d0c0b", fontSize: 16, fontWeight: "700" }}>Send on WhatsApp</Text>
              </Pressable>
              <Button title="Share another way" variant="soft" onPress={() => void share(text, link)} />
              <Button title="Done" variant="ghost" onPress={onDone} />
            </>
          ) : (
            <Button title="Done" onPress={onDone} />
          )}
        </Footer>
      </Animated.View>
    </Screen>
  );
}
