import { router } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Empty, Loading } from "@/components/programs/kit";
import { Bubble, Pill } from "@/components/requests/bits";
import { Avatar, Button, ErrorText, Footer, Screen, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { listRequests, recordPayment, remindRequest, type MoneyRequest } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { ago, settleRequest } from "@/lib/live";
import { formatMoney } from "@/lib/money";
import { openKin } from "@/lib/nav";
import { canRemind, dueLabel } from "@/lib/reminders";
import { sendDollars } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/requests/page.tsx. #24 Collect: pay or decline what people asked you for; track what you asked.

type Lists = { incoming: MoneyRequest[]; outgoing: MoneyRequest[] };

const STATUS = { open: "Waiting", paid: "Paid ✓✓", declined: "Declined" } as const;

/** Open requests with a date first, soonest (overdue) on top; the rest keep newest-first. */
const rank = (r: MoneyRequest) => (r.status === "open" && r.due ? r.due : Number.MAX_SAFE_INTEGER);
const byDue = (a: MoneyRequest, b: MoneyRequest) => rank(a) - rank(b);

function DueChip({ r }: { r: MoneyRequest }) {
  if (r.status !== "open" || !r.due) return null;
  const label = dueLabel(r.due);
  return <Pill tone={label === "Overdue" ? "bad" : "warn"}>{label}</Pill>;
}

export default function Requests() {
  const t = useTheme();
  const { canRead } = useAccount();
  const [lists, setLists] = useState<Lists | null>(null);
  const [err, setErr] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  // Needs a read session (or unlocked) so opening this never pops Face ID.
  useEffect(() => {
    if (canRead) listRequests().then(setLists, (e) => setErr(humanError(e)));
  }, [canRead]);

  async function remind(r: MoneyRequest) {
    setErr("");
    const set = (remindedAt: number | null) => setLists((l) => l && { ...l, outgoing: l.outgoing.map((x) => (x.id === r.id ? { ...x, remindedAt } : x)) });
    set(Date.now());
    try {
      await remindRequest(r.id);
    } catch (e) {
      if (String(e).includes("429")) return; // already reminded recently — keep the "Reminded" state
      set(r.remindedAt);
      setErr(humanError(e));
    }
  }

  const mark = (id: string, status: MoneyRequest["status"]) =>
    setLists((l) => l && { ...l, incoming: l.incoming.map((r) => (r.id === id ? { ...r, status } : r)) });

  async function pay(r: MoneyRequest) {
    setErr("");
    setPaying(r.id);
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 2000);
    try {
      const units = BigInt(r.amount);
      const hash = await sendDollars(r.from.address, units);
      mark(r.id, "paid");
      void settleRequest(r.id, "paid", hash).catch(() => {});
      void recordPayment(r.from.address, units, hash);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      clearTimeout(timer);
      setPaying(null);
    }
  }

  async function decline(r: MoneyRequest) {
    setErr("");
    mark(r.id, "declined");
    try {
      await settleRequest(r.id, "declined");
    } catch (e) {
      mark(r.id, "open");
      setErr(humanError(e));
    }
  }

  const open = lists?.incoming.filter((r) => r.status === "open").sort(byDue) ?? [];
  const done = lists?.incoming.filter((r) => r.status !== "open") ?? [];

  return (
    <Screen title="Requests" back scroll>
      <ErrorText>{err}</ErrorText>
      {!lists && !err && <Loading />}

      {lists && !lists.incoming.length && !lists.outgoing.length && (
        <Empty icon="request" title="No requests yet" sub="When someone asks you for money, it shows up here." />
      )}

      {[...open, ...done].map((r, i, all) => (
        <View key={r.id} style={{ gap: 12, paddingBottom: 20, borderBottomWidth: i < all.length - 1 ? 1 : 0, borderColor: t.line }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Avatar name={r.from.name} size={24} />
            <Text style={{ color: t.muted, fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
              <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>@{r.from.name || "someone"}</Text> · {ago(r.at)}
            </Text>
            <View style={{ marginLeft: "auto" }}><DueChip r={r} /></View>
            <Pressable onPress={() => openKin(`/messages/${r.from.address}`)} accessibilityRole="button" accessibilityLabel={`Message @${r.from.name || "them"}`}
              style={({ pressed }) => ({ width: 44, height: 44, marginVertical: -8, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? t.surface2 : "transparent" })}>
              <MessageCircle color={t.muted} size={20} />
            </Pressable>
          </View>
          <Bubble amount={formatMoney(BigInt(r.amount))} note={r.note} />
          {r.status === "open" ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button title="Decline" variant="soft" onPress={() => void decline(r)} disabled={!!paying} />
                </View>
                <View style={{ flex: 2 }}>
                  <Button title={`Pay ${formatMoney(BigInt(r.amount))}`} onPress={() => void pay(r)} busy={paying === r.id} disabled={!!paying && paying !== r.id} />
                </View>
              </View>
              {paying === r.id && (
                <Text accessibilityLiveRegion="polite" style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>
                  {slow ? `Delivering to @${r.from.name}…` : "Sending…"}
                </Text>
              )}
            </View>
          ) : (
            <Pill tone={r.status === "paid" ? "good" : "muted"}>{r.status === "paid" ? "You paid ✓✓" : "You declined"}</Pill>
          )}
        </View>
      ))}

      {!!lists?.outgoing.length && (
        <View style={{ marginTop: 16, gap: 16 }}>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase" }}>You asked</Text>
          {[...lists.outgoing].sort(byDue).map((r) => (
            <View key={r.id} style={{ gap: 4 }}>
              <Bubble mine amount={formatMoney(BigInt(r.amount))} note={r.note} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                <Text style={{ color: t.muted, fontSize: 14 }}>@{r.to.name || "someone"} · {ago(r.at)}</Text>
                <DueChip r={r} />
                {!(r.status === "open" && r.due) && (
                  <Pill tone={r.status === "paid" ? "good" : r.status === "declined" ? "muted" : "warn"}>{STATUS[r.status]}</Pill>
                )}
              </View>
              {r.status === "open" &&
                (canRemind(r.remindedAt) ? (
                  <Pressable onPress={() => void remind(r)} accessibilityRole="button"
                    style={({ pressed }) => ({ height: 44, alignSelf: "flex-end", justifyContent: "center", borderRadius: 22, paddingHorizontal: 20, backgroundColor: t.brandSoft, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                    <Text style={{ color: t.brand, fontSize: 14, fontWeight: "600" }}>Remind @{r.to.name || "them"}</Text>
                  </Pressable>
                ) : (
                  <View style={{ alignSelf: "flex-end" }}><Pill>Reminded ✓</Pill></View>
                ))}
            </View>
          ))}
        </View>
      )}

      <Footer>
        <Button title="+ Ask for money" variant="soft" onPress={() => router.push("/request")} />
      </Footer>
    </Screen>
  );
}
