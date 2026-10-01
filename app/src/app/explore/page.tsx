"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { MeButton, NavBar } from "@/components/core/NavBar";
import { Kinko } from "@/components/kinko/Kinko";
import { Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";

// [title, sub, href, icon, tile classes]. Bright fun-* tiles are the social/celebration ones; money tools stay calm.
const TILES: [string, string, string, ReactNode, string][] = [
  ["Pay a bill", "Money only for school, rent, doctor", "/earmark", "🧾", "col-span-2 bg-surface"],
  ["Chores", "Earn for helping", "/chores", "🧹", "bg-fun-5 text-fun-ink"],
  ["Savings jars", "Save for a goal", "/jars", "🫙", "bg-surface"],
  ["Kinko & Kin Score", "Dress up your buddy", "/kinko", <Kinko key="k" size={48} />, "col-span-2 bg-fun-3 text-fun-ink"],
  ["Gifts", "Opens on the day", "/gift", "🎁", "bg-fun-4 text-fun-ink"],
  ["Invoice", "Get paid for work", "/invoice", "💼", "bg-surface"],
  ["Circles", "Save together, take turns", "/circle", "🔄", "bg-surface"],
  ["Family pot", "Chip in for home", "/pot", "🏠", "bg-surface"],
  ["This month's spends", "Where your money went", "/spends", "📊", "col-span-2 bg-surface"],
  ["Split a bill", "Share the cost", "/split", "➗", "bg-surface"],
  ["People", "Your Kin contacts", "/contacts", "👥", "bg-surface"],
  ["Invite & earn", "You both get a Kinko treat", "/invite", "💌", "col-span-2 bg-fun-2 text-fun-ink"],
];

export default function Explore() {
  const { profile } = useRequireAccount();
  return (
    <>
      <Screen>
        <header className="flex h-12 items-center">
          <h1 className="flex-1 text-xl font-bold">Explore</h1>
          <MeButton name={profile?.name} />
        </header>
        <p className="font-display text-4xl leading-tight">Money that behaves.</p>
        <div className="grid grid-cols-2 gap-3">
          {TILES.map(([title, sub, href, icon, cls]) => {
            const fun = cls.includes("bg-fun");
            const wide = cls.includes("col-span-2");
            return (
              <Link key={href} href={href}
                className={`flex gap-3 rounded-[24px] p-4 transition active:scale-[0.97] ${fun ? "" : "border border-line"} ${wide ? "min-h-24 flex-row items-center" : "min-h-32 flex-col justify-between"} ${cls}`}>
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ${fun ? "bg-fun-ink/20" : "bg-surface-2"}`} aria-hidden>{icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${wide ? "text-lg" : ""}`}>{title}</span>
                  <span className={`block text-xs ${fun ? "opacity-85" : "text-muted"}`}>{sub}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </Screen>
      <NavBar />
    </>
  );
}
