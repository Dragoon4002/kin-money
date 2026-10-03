"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MeButton } from "@/components/core/NavBar";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { IconTile, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { listRequests } from "@/lib/contacts";
import type { IconName } from "@/lib/icons";

type Tile = { title: string; sub: string; icon: IconName };
// Every tile, by link. "Pay a bill" is the one brand tile.
const TILES: Record<string, Tile> = {
  "/requests": { title: "Requests", sub: "See what's waiting", icon: "request" },
  "/earmark": { title: "Pay a bill", sub: "Money only for school, rent, doctor", icon: "bill" },
  "/split": { title: "Split a bill", sub: "Share the cost", icon: "split" },
  "/invoice": { title: "Invoices", sub: "Get paid for work", icon: "invoice" },
  "/chores": { title: "Chores", sub: "Earn for helping", icon: "chores" },
  "/jars": { title: "Savings jars", sub: "Save for a goal", icon: "jars" },
  "/spends": { title: "Monthly spends", sub: "Where your money went", icon: "spends" },
  "/allowance": { title: "Live allowance", sub: "Grows every second", icon: "allowance" },
  "/trips": { title: "Trips", sub: "Who paid what", icon: "trip" },
  "/circle": { title: "Circles", sub: "Save together, take turns", icon: "circle" },
  "/pot": { title: "Family pot", sub: "Chip in for home", icon: "pot" },
  "/gift": { title: "Gifts", sub: "Opens on the day", icon: "gift" },
  "/autopay": { title: "AutoPay", sub: "Paid every month", icon: "schedule" },
  "/kinko": { title: "Kinko & Kin Score", sub: "Dress up your buddy", icon: "kinko" },
  "/invite": { title: "Invite & earn", sub: "You both get a Kinko treat", icon: "invite" },
};

// Bento blocks: a wide card, then two small cards stacked beside one tall card (`flip` swaps the sides).
// Related tiles sit together: bills, trips + circles, chores + invoices, savings + spends.
const BLOCKS: { wide: string; small: [string, string]; tall: string; flip?: boolean }[] = [
  { wide: "/requests", small: ["/earmark", "/split"], tall: "/invoice" },
  { wide: "/chores", small: ["/spends", "/allowance"], tall: "/jars", flip: true },
  { wide: "/trips", small: ["/circle", "/pot"], tall: "/gift" },
];
const TAIL = ["/autopay", "/kinko", "/invite"]; // wide cards

export default function Explore() {
  const { profile, canRead } = useRequireAccount();
  const [waiting, setWaiting] = useState(0);
  // Only with a read session: the count must never trigger Face ID on its own.
  useEffect(() => {
    if (canRead) listRequests().then((r) => setWaiting(r.incoming.filter((q) => q.status === "open").length), () => {});
  }, [canRead]);

  function card(href: string, shape: "wide" | "small" | "tall", place = "") {
    const t = TILES[href];
    const sub = href === "/requests" && waiting ? `${waiting} waiting for you` : t.sub;
    const icon = t.icon === "kinko" ? <MyKinko size={shape === "tall" ? 64 : 48} /> : <IconTile name={t.icon} tone={href === "/earmark" ? "brand" : "neutral"} />;
    return (
      <Link key={href} href={href}
        className={`flex gap-3 rounded-[24px] border border-line bg-surface p-4 transition active:scale-[0.97] ${place} ${shape === "wide" ? "min-h-24 flex-row items-center" : shape === "small" ? "min-h-28 flex-col justify-between" : "min-h-56 flex-col justify-between"}`}>
        {icon}
        <span className={`min-w-0 ${shape === "tall" ? "" : "flex-1"}`}>
          <span className={`block font-semibold ${shape === "tall" ? "text-lg" : ""}`}>{t.title}</span>
          <span className="block text-xs text-muted">{sub}</span>
        </span>
      </Link>
    );
  }

  return (
    <Screen>
      <header className="flex h-12 items-center">
        <h1 className="flex-1 text-xl font-bold">Explore</h1>
        <MeButton name={profile?.name} />
      </header>
      <p className="font-display text-4xl leading-tight">Money that behaves.</p>
      <div className="flex flex-col gap-3">
        {BLOCKS.map(({ wide, small, tall, flip }) => (
          <div key={wide} className="flex flex-col gap-3">
            {card(wide, "wide")}
            <div className="grid grid-cols-2 grid-rows-2 gap-3">
              {card(small[0], "small", flip ? "col-start-2 row-start-1" : "col-start-1 row-start-1")}
              {card(small[1], "small", flip ? "col-start-2 row-start-2" : "col-start-1 row-start-2")}
              {card(tall, "tall", flip ? "col-start-1 row-span-2 row-start-1" : "col-start-2 row-span-2 row-start-1")}
            </div>
          </div>
        ))}
        {TAIL.map((href) => card(href, "wide"))}
      </div>
    </Screen>
  );
}
