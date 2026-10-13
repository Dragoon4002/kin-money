import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "@/lib/account";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { api, recordPayment } from "@/lib/contacts";
import { createGiftLink } from "@/lib/giftLinks";
import { fromLocal } from "@/lib/money";
import { loadDirectory, resolveName } from "@/lib/names";
import { createdId, same, ZERO } from "@/lib/programs";
import type { Trie } from "@/lib/trie";
import { call } from "@/lib/tx";
import { GiftWrap } from "./GiftWrap";

// Port of NewGift in app/src/app/gift/page.tsx: the note is the form (GiftWrap), same onchain calls as before.
// "Someone to OK it first?" (guardian) hidden for now (user, Oct 13): approver stays ZERO, no expiry.

export function NewGift({ me, onClose }: { me?: Address; onClose: () => void }) {
  const { profile } = useAccount();
  const [trie, setTrie] = useState<Trie | null>(null);
  const to = useRef<Address | null>(null); // resolved in check, used by send
  useEffect(() => void loadDirectory().then((d) => setTrie(d.trie)), []); // no suggestions on failure; exact lookup still works

  return (
    <GiftWrap from={profile?.name ?? ""} onClose={onClose} suggest={(p) => trie?.suggest(p, 6) ?? []}
      check={async (d) => {
        if (d.mode === "link") return null;
        to.current = await resolveName(d.to);
        if (!to.current) return "No one on Kin with that name yet.";
        return same(to.current, me) ? "That's you. Pick someone else." : null;
      }}
      send={async (d, unlockAt) => {
        const value = fromLocal(d.amount);
        if (d.mode === "link") return (await createGiftLink(value, unlockAt, d.msg.trim())).url;
        const who = to.current!;
        const hash = await call(addr.escrow, KinEscrowAbi, "create", [who, ZERO, ZERO, unlockAt, 0, 0], { fund: value });
        void recordPayment(who, value);
        // The message rides next to the gift (KinEscrow has no field for it). Best effort: the gift is already held.
        if (d.msg.trim()) void createdId(hash, KinEscrowAbi, "Created").then((id) => api("/api/gift-notes", "POST", { id: String(id), body: d.msg.trim() })).catch(() => {});
      }} />
  );
}
