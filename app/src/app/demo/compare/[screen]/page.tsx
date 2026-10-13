"use client";
import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { screenOf } from "@/components/demo/screens";

// A real testnet payment (AUSD transfer, Oct 2026). /details needs a signed-in account in this browser.
const REAL_TX = "0x5aa0fb4b4d921a20190ba18cf313d8a25b15a3247ee8f31871b68139650a6a13";

function Compare() {
  const { screen } = useParams<{ screen: string }>();
  const tx = useSearchParams().get("tx") ?? REAL_TX;
  const s = screenOf(screen);
  const [run, setRun] = useState(0);
  if (!s?.real) notFound();
  const theme = () => {
    // Same-origin frames: flip all three documents together (not persisted).
    const docs = [document, ...[...document.querySelectorAll("iframe")].map((f) => f.contentDocument)];
    const dark = document.documentElement.dataset.theme !== "dark";
    for (const d of docs) if (d) d.documentElement.dataset.theme = dark ? "dark" : "light";
  };
  const frame = "h-[844px] w-[390px] shrink-0 rounded-[28px] border border-line bg-bg";
  const btn = "h-9 rounded-full bg-surface-2 px-3 text-xs font-semibold active:scale-95";
  return (
    // Escapes the root max-w-md column so both phones fit side by side on desktop.
    <div className="relative left-1/2 flex w-screen -translate-x-1/2 flex-col items-center gap-3 p-3">
      <nav className="flex flex-wrap items-center gap-1.5">
        <Link href="/demo" className={`grid place-items-center ${btn}`}>‹ Demo</Link>
        <button className={btn} onClick={() => setRun((r) => r + 1)}>Replay both</button>
        <button className={btn} onClick={theme}>Theme</button>
        <span className="text-xs text-muted">{s.title}</span>
      </nav>
      <div className="flex flex-wrap justify-center gap-4">
        {[["Current", s.real.replace("TX", tx)], ["Refactored", `/demo/${s.id}`]].map(([label, src]) => (
          <figure key={label} className="flex flex-col items-center gap-1">
            <figcaption className="w-[390px] truncate text-xs text-muted"><b>{label}</b> · {src}</figcaption>
            <iframe key={run} src={src} title={label} className={frame} />
          </figure>
        ))}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <Compare />
    </Suspense>
  );
}
