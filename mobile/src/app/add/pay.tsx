import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { SendThis, timeLeft, useAddStatus, useSecondsLeft } from "@/components/addmoney/PayIn";
import { Card, Delivered } from "@/components/trips/bits";
import { Screen, Serif, Text } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";
import { useTheme } from "@/theme";

// Port of app/src/app/add/pay/page.tsx. Pay page for a shared Add money request: /add/pay?d=<deposit code>.
// Everything shown (amount, coin, who it's for) comes from Aurora's record for that code, never from the link.

export default function PayRequest() {
  const t = useTheme();
  const { d = "" } = useLocalSearchParams<{ d?: string }>();
  const live = useAddStatus(d || null);
  const q = live?.quote?.source ? live.quote : null;
  const status = live?.status;
  const waiting = status === "PENDING_DEPOSIT";
  const left = useSecondsLeft(q?.deadline, waiting);
  const [name, setName] = useState("");

  useEffect(() => {
    if (q?.recipient && isAddress(q.recipient)) nameOf(q.recipient).then(setName, () => {});
  }, [q?.recipient]);

  const who = name ? `@${name}` : "your friend";
  const Who = name ? who : "Your friend"; // sentence start
  const asked = q ? formatMoney(BigInt(q.amountOut)) : "";

  let body;
  if (!d || live?.missing || (live && !q)) body = <Note title="This link isn't valid" text="Ask for a new payment link." />;
  else if (!live) body = <Text style={{ color: t.muted, textAlign: "center" }}>Getting the details…</Text>;
  else if (status === "SUCCESS")
    body = <Delivered title="Paid" subtitle={`${Who} got ${formatMoney(BigInt(live.amountOut ?? q!.amountOut))}. Thank you!`} />;
  else if (status === "REFUNDED" || status === "FAILED")
    body = <Note title="This one didn't go through" text={`If you sent money, it's held safely for ${who}. Ask ${who} to get it back to you.`} />;
  else if (waiting && left === 0) body = <Note title="This link expired" text={`Don't send to it. Ask ${who} for a new one.`} />;
  else if (status === "INCOMPLETE_DEPOSIT")
    body = <Note title="Amount didn't match" text={`Send the rest within ${timeLeft(left)}, or the money is held for ${who} to get back to you.`} />;
  else if (!waiting) body = <Note title="Received — on its way" text={`${Who} gets ${asked} in a moment. You can close this page.`} />;
  else
    body = (
      <>
        <Text style={{ color: t.ink, fontSize: 18, textAlign: "center" }}>
          <Text style={{ fontWeight: "600" }}>{Who}</Text> asked you for <Text style={{ fontWeight: "600", fontVariant: ["tabular-nums"] }}>{asked}</Text>
        </Text>
        <SendThis q={q!} left={left}>
          <Text style={{ marginTop: 8, color: t.muted, fontSize: 12, textAlign: "center" }}>If something goes wrong, the money is held safely for {who}, who can send it back.</Text>
        </SendThis>
      </>
    );

  return <Screen title="Payment request" back scroll>{body}</Screen>;
}

function Note({ title, text }: { title: string; text: string }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: "center" }}>
      <Serif size={26}>{title}</Serif>
      <Text accessibilityLiveRegion="polite" style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{text}</Text>
    </Card>
  );
}
