import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Check, Copy as CopyIcon, MessageCircle, ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { erc20Abi, isAddressEqual, isHash, parseEventLogs, type Address, type Hex } from "viem";
import { share } from "@/components/programs/kit";
import { Kinko } from "@/components/Kinko";
import { Band, Button, Chip, Footer, IconTile, Row, Screen, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { categoryOf } from "@/lib/activity";
import { cashoutOf, inr } from "@/lib/cashout";
import { CATEGORIES, setCategory } from "@/lib/categories";
import { API_BASE, money as moneyNet, networks, type Network } from "@/lib/config";
import { describe, isKinContract } from "@/lib/counterparty";
import { useKinko } from "@/lib/kinko";
import { formatMoney } from "@/lib/money";
import { nameOf, shortAddr } from "@/lib/names";
import { openKin } from "@/lib/nav";
import { shareCard, type CardParams } from "@/lib/shareCard";
import { useTheme } from "@/theme";

// Port of app/src/app/details/Proof.tsx. Receipt; proof of payment (public-ledger record) lives ONLY here.

type Receipt = { net: Network; amount: bigint; from: string; to: string; fromA?: Address; toA?: Address; out: boolean; at: Date; block: bigint; ok: boolean };

// Not on Kin (no @name) → short address; the full one is copyable below.
const label = (n: string, a?: Address) => (n ? `@${n}` : a ? shortAddr(a) : "someone");
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const OTHER = CATEGORIES[CATEGORIES.length - 1];

async function load(hash: Hex, me?: Address): Promise<Receipt> {
  // Current mode's network first, then the other one (a practice receipt opened in real-money mode, or vice versa).
  const first = moneyNet();
  let found: { net: Network; r: Awaited<ReturnType<Network["client"]["getTransactionReceipt"]>> } | null = null;
  for (const net of [first, first.mode === "main" ? networks.test : networks.main]) {
    const r = await net.client.getTransactionReceipt({ hash }).catch(() => null);
    if (r) {
      found = { net, r };
      break;
    }
  }
  if (!found) throw new Error("receipt not found");
  const { net, r } = found;
  const block = await net.client.getBlock({ blockNumber: r.blockNumber });
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: r.logs }).filter((l) => isAddressEqual(l.address, net.ausd));
  const t = transfers.find((l) => me && (isAddressEqual(l.args.from, me) || isAddressEqual(l.args.to, me))) ?? transfers[0];
  // A Kin contract on either side → describe what it was for ("Chore for @b"), else the person's @name.
  const side = async (a: Address, dir: "in" | "out") =>
    isKinContract(a) && me ? describe(hash, a, dir, me) : label(await nameOf(a).catch(() => ""), a);
  const [from, to] = t ? await Promise.all([side(t.args.from, "in"), side(t.args.to, "out")]) : [label(""), label("")];
  return {
    net,
    amount: t?.args.value ?? 0n,
    from,
    to,
    fromA: t?.args.from,
    toA: t?.args.to,
    out: !!(t && me && isAddressEqual(t.args.from, me)),
    at: new Date(Number(block.timestamp) * 1000),
    block: r.blockNumber,
    ok: r.status === "success",
  };
}

const onKin = (s: string) => (s.startsWith("0x") ? "Not on Kin" : "On Kin");
/** Friendly short receipt number: "A1B2C3…9F0E". */
const paymentId = (h: string) => `${h.slice(2, 8)}…${h.slice(-4)}`.toUpperCase();

function noteOf(hash: string) {
  try {
    return SecureStore.getItem(`kin.note.${hash.toLowerCase()}`) ?? "";
  } catch {
    return "";
  }
}

function Copy({ text, what }: { text: string; what: string }) {
  const t = useTheme();
  const [done, setDone] = useState(false);
  return (
    <Pressable accessibilityLabel={`Copy ${what}`} accessibilityRole="button"
      onPress={() => void Clipboard.setStringAsync(text).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? t.surface2 : "transparent" })}>
      {done ? <Check color={t.good} size={20} /> : <CopyIcon color={t.muted} size={20} />}
    </Pressable>
  );
}

const copyOf = (s: string, a?: Address) =>
  s.startsWith("@") ? <Copy text={s} what="name" /> : s.startsWith("0x") && a ? <Copy text={a} what="address" /> : null;

export default function Details() {
  const t = useTheme();
  const { profile } = useAccount();
  const { look } = useKinko(profile?.address);
  const params = useLocalSearchParams<{ tx?: string; fresh?: string; ms?: string }>();
  const tx = one(params.tx);
  const hash = isHash(tx) ? tx : null;
  const fresh = one(params.fresh) === "1";
  const ms = Number(one(params.ms));
  const me = profile?.address;
  const [r, setR] = useState<Receipt | null>(null);
  const [failed, setFailed] = useState(false);
  const [cat, setCat] = useState(() => (hash ? (categoryOf(hash) ?? OTHER) : OTHER));
  const [editing, setEditing] = useState(false);
  const [note] = useState(() => (hash ? noteOf(hash) : ""));
  const [cash] = useState(() => (hash ? cashoutOf(hash) : null)); // rupees, remembered on this phone

  useEffect(() => {
    if (hash) load(hash, me).then(setR).catch(() => setFailed(true));
  }, [hash, me]);

  // Nudge the server so the other person's notification goes out now (fire-and-forget).
  useEffect(() => {
    if (fresh) fetch(`${API_BASE}/api/push/tick`).catch(() => {});
  }, [fresh]);

  if (!hash || failed) {
    return (
      <Screen title="Receipt" back>
        <View style={{ borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 20 }}>
          <Text style={{ color: t.ink }}>We couldn&apos;t find this receipt. Your money is safe.</Text>
        </View>
      </Screen>
    );
  }

  if (!r) {
    return (
      <Screen title="Receipt" back>
        <View accessibilityLabel="Loading receipt" style={{ alignItems: "center", gap: 16, paddingVertical: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: t.surface2 }} />
          <View style={{ width: 192, height: 56, borderRadius: 16, backgroundColor: t.surface2 }} />
          <ActivityIndicator color={t.muted} />
        </View>
      </Screen>
    );
  }

  const money = formatMoney(r.amount);
  const other = r.out ? r.to : r.from;
  const when = `${r.at.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}, ${r.at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  const secs = ms > 0 ? (ms / 1000).toFixed(1) : null;
  // Share card: only the amount + @names, never the receipt number or account.
  const at = (s: string) => (s.startsWith("@") ? s.slice(1) : undefined);
  const card: CardParams | null = !r.ok ? null : r.out
    ? { kind: "sent", amount: r.amount, to: at(r.to), from: profile?.name, secs: fresh && ms > 0 && ms < 60_000 ? (ms / 1000).toFixed(1) : undefined }
    : { kind: "received", amount: r.amount, from: at(r.from) };
  const shareReceipt = () => share(`${r.out ? `Paid ${money} to ${other}` : `Got ${money} from ${other}`} with Kin${note ? ` · ${note}` : ""}. Delivered ✓✓`);

  return (
    <Screen title="Receipt" back scroll>
      <View style={{ alignItems: "center", gap: 12 }}>
        {!r.ok ? (
          <>
            <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: `${t.bad}26` }}>
              <Text style={{ color: t.bad, fontSize: 30, fontWeight: "700" }}>!</Text>
            </View>
            <Text style={{ color: t.muted }}>Didn&apos;t go through — money not moved</Text>
          </>
        ) : fresh ? (
          <View>
            <Kinko look={look} mood="celebrate" size={56} />
            <View style={{ position: "absolute", bottom: -4, right: -12, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: t.bg, alignItems: "center", justifyContent: "center", backgroundColor: t.good }}>
              <Check color="#1b1815" size={16} />
            </View>
          </View>
        ) : (
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: t.good }}>
            <Check color="#1b1815" size={30} />
          </View>
        )}
        <View style={{ alignItems: "center", gap: 4 }}>
          <Serif size={30} color={t.muted}>{r.out ? "Paid" : "Received"}</Serif>
          <Serif size={56}>{money}</Serif>
        </View>
        {r.ok && <Chip good>{fresh && secs ? `Delivered in ${secs}s ✓✓` : "Delivered ✓✓"}</Chip>}
        {!!note && <Chip>“{note}”</Chip>}
      </View>

      <View style={{ gap: 4, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 20 }}>
        <Text style={{ color: t.muted, fontSize: 14 }}>{r.out ? "Paid to" : "Received from"}</Text>
        <Serif size={30}>{other}</Serif>
        {other.startsWith("@") && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ShieldCheck color={t.good} size={16} />
            <Text style={{ color: t.muted, fontSize: 14 }}>Kin name: {other}</Text>
          </View>
        )}
        <Text style={{ color: t.muted, fontSize: 14, marginTop: 8 }}>{when}</Text>
        {other.startsWith("@") && (
          <Pressable onPress={() => openKin(`/messages/${other.slice(1)}`)} accessibilityRole="button"
            style={({ pressed }) => ({ marginTop: 8, height: 44, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, paddingHorizontal: 16, backgroundColor: t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
            <MessageCircle color={t.ink} size={18} />
            <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>Message {other}</Text>
          </Pressable>
        )}
      </View>

      {cash && (
        <View style={{ gap: 4, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 20 }}>
          <Text style={{ color: t.muted, fontSize: 14 }}>Cash out</Text>
          <Serif size={30}>{inr(cash.rupees)}</Serif>
          <Text style={{ color: t.muted, fontSize: 14 }}>{cash.practice ? "Practice cash-out: no rupees moved" : "Cashed out to your bank"}</Text>
        </View>
      )}

      {r.out && (
        <View>
          <Row icon={<IconTile icon={cat.icon} size={44} />} title={cat.label} sub="Category"
            trail={
              <Pressable onPress={() => setEditing((e) => !e)} accessibilityRole="button"
                style={({ pressed }) => ({ height: 44, justifyContent: "center", borderRadius: 22, paddingHorizontal: 16, backgroundColor: pressed ? t.brandSoft : "transparent" })}>
                <Text style={{ color: t.brand, fontSize: 14, fontWeight: "600" }}>{editing ? "Done" : "Edit"}</Text>
              </Pressable>
            } />
          {editing && (
            <View accessibilityRole="radiogroup" accessibilityLabel="Category" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 8 }}>
              {CATEGORIES.map((c) => {
                const on = cat.id === c.id;
                return (
                  <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    onPress={() => (setCategory(hash, c.id).catch(() => {}), setCat(c), setEditing(false))}
                    style={{ height: 44, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 22, paddingHorizontal: 16, backgroundColor: on ? t.ink : t.surface2 }}>
                    <c.icon color={on ? t.bg : t.muted} size={18} />
                    <Text style={{ color: on ? t.bg : t.muted, fontSize: 14, fontWeight: "600" }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      <View>
        <Band>Details</Band>
        <Row title={`To: ${r.to}`} sub={r.out ? onKin(r.to) : "You"} trail={copyOf(r.to, r.toA)} />
        <Row title={`From: ${r.from}`} sub={r.out ? "You" : onKin(r.from)} trail={copyOf(r.from, r.fromA)} />
        <Row title="Payment ID" sub={paymentId(hash)} trail={<Copy text={paymentId(hash)} what="payment ID" />} />
      </View>

      <View style={{ gap: 12 }}>
        <Band>Proof of payment</Band>
        <Text style={{ color: t.muted, fontSize: 14 }}>
          Every Kin payment is recorded on the Monad public blockchain, so anyone can check it happened. Settled in dollars (AUSD), no fees.
        </Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>Block {r.block.toString()}</Text>
        <Text selectable style={{ color: t.ink, fontSize: 12, fontFamily: "monospace", borderRadius: 16, padding: 12, backgroundColor: t.surface2 }}>{hash}</Text>
        <Button title="Verify on the public explorer ↗" variant="soft" onPress={() => void WebBrowser.openBrowserAsync(`${(r?.net ?? moneyNet()).explorer}/tx/${hash}`)} />
      </View>

      <Footer>
        {card && <Button title="Share card" variant="ghost" onPress={() => void shareCard(card, `${r.out ? "Sent" : "Got"} ${money} with Kin. Delivered ✓✓`)} />}
        <Button title="Share receipt" onPress={() => void shareReceipt()} />
      </Footer>
    </Screen>
  );
}
