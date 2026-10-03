"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MeButton } from "@/components/core/NavBar";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { IconTile, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { listRequests } from "@/lib/contacts";
import type { IconName } from "@/lib/icons";

// [title, sub, href, icon, wide]. Wide = full row; the rest pair up two per row. "Pay a bill" is the one brand tile.
const TILES: [string, string, string, IconName, boolean][] = [
  ["Pay a bill", "Money only for school, rent, doctor", "/earmark", "bill", false],
  ["Split a bill", "Share the cost", "/split", "split", false],
  ["Trips", "Who paid what", "/trips", "trip", false],
  ["Circles", "Save together, take turns", "/circle", "circle", false],
  ["Chores", "Earn for helping", "/chores", "chores", false],
  ["Invoices", "Get paid for work", "/invoice", "invoice", false],
  ["Savings jars", "Save for a goal", "/jars", "jars", false],
  ["Monthly spends", "Where your money went", "/spends", "spends", false],
  ["Live allowance", "Grows every second", "/allowance", "allowance", false],
  ["AutoPay", "Paid every month", "/autopay", "schedule", false],
  ["Family pot", "Chip in for home", "/pot", "pot", false],
  ["Gifts", "Opens on the day", "/gift", "gift", false],
  ["Kinko & Kin Score", "Dress up your buddy", "/kinko", "kinko", true],
  ["Invite & earn", "You both get a Kinko treat", "/invite", "invite", true],
];

export default function Explore() {
  const { profile, canRead } = useRequireAccount();
  const [waiting, setWaiting] = useState(0);
  // Only with a read session: the count must never trigger Face ID on its own.
  useEffect(() => {
    if (canRead) listRequests().then((r) => setWaiting(r.incoming.filter((q) => q.status === "open").length), () => {});
  }, [canRead]);
  const tiles: typeof TILES = [["Requests", waiting ? `${waiting} waiting for you` : "See what's waiting", "/requests", "request", true], ...TILES];
  return (
    <>
      <Screen>
        <header className="flex h-12 items-center">
          <h1 className="flex-1 text-xl font-bold">Explore</h1>
          <MeButton name={profile?.name} />
        </header>
        <p className="font-display text-4xl leading-tight">Money that behaves.</p>
        <div className="grid grid-cols-2 gap-3">
          {tiles.map(([title, sub, href, icon, wide]) => (
            <Link key={href} href={href}
              className={`flex gap-3 rounded-[24px] border border-line bg-surface p-4 transition active:scale-[0.97] ${wide ? "col-span-2 min-h-24 flex-row items-center" : "min-h-32 flex-col justify-between"}`}>
              {icon === "kinko" ? <MyKinko size={48} /> : <IconTile name={icon} tone={href === "/earmark" ? "brand" : "neutral"} />}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-xs text-muted">{sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </Screen>
    </>
  );
}
