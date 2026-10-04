"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MeButton } from "@/components/core/NavBar";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { IconTile, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { useMode } from "@/lib/mode";
import { listRequests } from "@/lib/contacts";
import type { IconName } from "@/lib/icons";

type Tile = { title: string; sub: string; icon: IconName };
// Every tile, by link. "Pay a bill" is the one brand tile.
const TILES: Record<string, Tile> = {
  "/requests": { title: "Requests", sub: "See what's waiting", icon: "request" },
  "/earmark": { title: "Pay a bill", sub: "Money only for school, rent, doctor", icon: "bill" },
  "/split": { title: "Split a bill", sub: "Share the cost", icon: "split" },
  "/invoice": { title: "Invoices", sub: "Get paid for work", icon: "invoice" },
  "/spends": { title: "Monthly spends", sub: "Where your money went", icon: "spends" },
  "/jars": { title: "Savings jars", sub: "Save for a goal", icon: "jars" },
  "/allowance": { title: "Live allowance", sub: "Grows every second", icon: "allowance" },
  "/autopay": { title: "AutoPay", sub: "Paid every month", icon: "schedule" },
  "/circle": { title: "Circles", sub: "Save together, take turns", icon: "circle" },
  "/pot": { title: "Family pot", sub: "Chip in for home", icon: "pot" },
  "/trips": { title: "Trips", sub: "Who paid what", icon: "trip" },
  "/chores": { title: "Chores", sub: "Earn for helping", icon: "chores" },
  "/gift": { title: "Gifts", sub: "Opens on the day", icon: "gift" },
  "/kinko": { title: "KinScore", sub: "Dress up your buddy", icon: "kinko" },
  "/invite": { title: "Invite & earn", sub: "You both get a Kinko treat", icon: "invite" },
};

// The layout. Each row is one of:
//   [href]                              a wide card
//   [href, href]                        two half cards side by side
//   { small: [href, href], tall: href } two small cards stacked beside one tall card (`flip`: tall on the left)
// A tile only shows if it is listed here, and each link should appear once.
type Row = [string] | [string, string] | { small: [string, string]; tall: string; flip?: boolean };
const SECTIONS: { title?: string; rows: Row[] }[] = [
  { rows: [["/requests"]] },
  { title: "Pay & get paid", rows: [["/earmark", "/split"], ["/invoice"]] },
  { title: "Money", rows: [["/spends"], ["/jars", "/allowance"], ["/autopay"]] },
  { title: "Together", rows: [["/circle", "/pot"], ["/trips", "/chores"]] },
  { title: "More", rows: [["/gift", "/kinko"], ["/invite"]] },
];

export default function Explore() {
  const { profile, canRead } = useRequireAccount();
  const mode = useMode();
  const [waiting, setWaiting] = useState(0);
  // Only with a read session: the count must never trigger Face ID on its own.
  useEffect(() => {
    if (canRead) listRequests().then((r) => setWaiting(r.incoming.filter((q) => q.status === "open").length), () => {});
  }, [canRead]);

  function card(href: string, shape: "wide" | "half" | "tall", place = "") {
    const t = TILES[href];
    const icon = t.icon === "kinko" ? <MyKinko size={shape === "tall" ? 64 : 48} /> : <IconTile name={t.icon} tone={href === "/earmark" ? "brand" : "neutral"} />;
    return (
      <Link key={href} href={href}
        className={`flex gap-3 rounded-[24px] border border-line bg-surface p-4 transition active:scale-[0.97] ${place} ${shape === "wide" ? "min-h-24 flex-row items-center" : shape === "half" ? "min-h-28 flex-col justify-between" : "min-h-56 flex-col justify-between"}`}>
        {icon}
        <span className={`min-w-0 ${shape === "tall" ? "" : "flex-1"}`}>
          <span className={`block font-semibold ${shape === "tall" ? "text-lg" : ""}`}>{t.title}</span>
          <span className="block text-xs text-muted">{t.sub}</span>
        </span>
        {href === "/requests" && waiting > 0 && (
          <span className="grid h-8 min-w-8 place-items-center rounded-full bg-brand px-2 text-sm font-bold text-brand-ink" aria-label={`${waiting} waiting for you`}>{waiting}</span>
        )}
      </Link>
    );
  }

  function row(r: Row) {
    if (!Array.isArray(r)) {
      const { small, tall, flip } = r;
      return (
        <div key={tall} className="grid grid-cols-2 grid-rows-2 gap-3">
          {card(small[0], "half", flip ? "col-start-2 row-start-1" : "col-start-1 row-start-1")}
          {card(small[1], "half", flip ? "col-start-2 row-start-2" : "col-start-1 row-start-2")}
          {card(tall, "tall", flip ? "col-start-1 row-span-2 row-start-1" : "col-start-2 row-span-2 row-start-1")}
        </div>
      );
    }
    if (r.length === 1) return card(r[0], "wide");
    return <div key={r[0]} className="grid grid-cols-2 gap-3">{r.map((h) => card(h, "half"))}</div>;
  }

  return (
    <Screen>
      <header className="flex h-12 items-center">
        <h1 className="flex-1 text-xl font-bold">Explore</h1>
        <MeButton name={profile?.name} />
      </header>
      {mode === "main" && (
        <p className="rounded-[20px] bg-surface-2 px-4 py-3 text-sm text-muted">These use practice money for now. Turn off Real money in Me to try them.</p>
      )}
      <p className="font-display text-4xl leading-tight">Money that behaves.</p>
      <div className="flex flex-col gap-6">
        {SECTIONS.map(({ title, rows }) => (
          <section key={title ?? "top"} className="flex flex-col gap-3">
            {title && <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted">{title}</h2>}
            {rows.map(row)}
          </section>
        ))}
      </div>
    </Screen>
  );
}
