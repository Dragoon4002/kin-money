"use client";
// Demo-only count-up for text amounts (cashoutParts). Shared motion lives in components/receipt/motion.tsx.
import { CountUp } from "@/components/receipt/motion";

/** "49.98 USDC" → counts the number, keeps its decimals and the rest of the text. */
export function CountText({ text, delay }: { text: string; delay?: number }) {
  const m = text.match(/^(\d+(?:\.(\d+))?)(.*)$/);
  if (!m) return <>{text}</>;
  return <CountUp value={Number(m[1])} format={(n) => `${n.toFixed(m[2]?.length ?? 0)}${m[3]}`} delay={delay} />;
}
