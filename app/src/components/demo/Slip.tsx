"use client";
// Demo copy of the shared slip parts (components/receipt/Slip.tsx) + the receipt with fake data.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { share } from "@/components/core/share";
import { ReceiptTicket, type Receipt } from "@/components/receipt/ReceiptTicket";
import type { Category } from "@/lib/categories";
import { shareCard } from "@/lib/shareCard";
import * as F from "./fixtures";

export * from "@/components/receipt/Slip";

// Demo stand-in for setNote(hash, note): kept for this tab only, so reopening the screen shows the saved note.
let demoNote = "";

/** The real payment receipt with fake data. Tear off = leave, like the real screen will (there: Proof's back target). */
export function Ticket({ r = F.RECEIPT_SENT, ms, back, note }: { r?: Receipt; ms?: number; back?: string; note?: string }) {
  const router = useRouter();
  const [cat, setCat] = useState<Category>(F.CAT_FOOD);
  return <ReceiptTicket hash={F.fakeHash(0x5a)} r={r} ms={ms} back={back} note={note ?? demoNote} onNote={(n) => (demoNote = n)} cat={cat} onCategory={setCat} onShare={(text, card) => (card ? shareCard(card, text) : share(text))}
    onTear={() => (history.length > 1 ? router.back() : router.push("/demo"))} />;
}
