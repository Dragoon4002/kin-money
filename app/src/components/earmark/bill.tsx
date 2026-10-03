"use client";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { Status, Who, useAction, useNow } from "@/components/programs/kit";
import { Button, Chip, ErrorText } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { api, recordPayment } from "@/lib/contacts";
import type { IconName } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { canRelease, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";

// Shared by /earmark and /earmark/[id]: what a bill is for, its state, and the one next step for me.

export const BILL_FOR = {
  school: { label: "School fees", short: "School", icon: "education" },
  rent: { label: "Rent", short: "Rent", icon: "rent" },
  doctor: { label: "Doctor or hospital", short: "Doctor", icon: "bill" },
  other: { label: "Other bill", short: "Other", icon: "bill" },
} as const satisfies Record<string, { label: string; short: string; icon: IconName }>;
export type BillFor = keyof typeof BILL_FOR;

/** Sender saves what it's for (server checks the bill is theirs). Best effort. */
export const saveBillFor = (id: bigint, what: BillFor) => api("/api/bills", "POST", { id: String(id), for: what }).catch(() => {});

/** id → what it's for, for bills I sent, collect or check. Missing = not saved. */
export async function loadBillFor(ids: bigint[]): Promise<Record<string, BillFor | undefined>> {
  if (!ids.length) return {};
  return api<Record<string, BillFor>>(`/api/bills?ids=${ids.slice(0, 50).join(",")}`).catch(() => ({}));
}

export function BillState({ e, me }: { e: Escrow; me?: Address }): ReactNode {
  if (e.settled) return <Chip tone="good">Done ✓✓</Chip>;
  if (e.approver === ZERO || e.approved) return <Chip tone="brand">Ready for <Who a={e.to} me={me} you="you" /> to collect</Chip>;
  return <Chip tone="warn">Waiting for <Who a={e.approver} me={me} you="your" />{same(e.approver, me) ? "" : "'s"} OK</Chip>;
}

/** The bottom buttons: OK it, collect it, or take it back — whichever is mine to do. */
export function BillActions({ e, me, onDone }: { e: Escrow; me?: Address; onDone: () => void }) {
  const now = useNow(30_000);
  const { busy, status, error, run } = useAction();
  const iApprove = same(e.approver, me) && !e.approved && !e.settled;
  const iCollect = same(e.to, me) && canRelease(e, now);
  const iRefund = same(e.from, me) && !e.settled && !!e.expiresAt && now >= e.expiresAt;

  async function act(fn: "approve" | "release" | "refund") {
    const ok = await run(async () => (await call(addr.escrow, KinEscrowAbi, fn, [e.id]), true));
    if (ok) {
      if (fn === "approve") void recordPayment(e.to, e.amount);
      onDone();
    }
  }

  return (
    <>
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {iApprove && <Button onClick={() => act("approve")} busy={busy}>Bill looks right — pay it</Button>}
      {!iApprove && iCollect && <Button onClick={() => act("release")} busy={busy}>Collect {formatMoney(e.amount)}</Button>}
      {iRefund && <Button variant={iApprove || iCollect ? "soft" : "primary"} onClick={() => act("refund")} busy={busy}>Take it back</Button>}
    </>
  );
}
