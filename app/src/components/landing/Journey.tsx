"use client";
import { useEffect, useRef, useState } from "react";

const STOPS = ["You", "Your bank", "Bank in NY", "Rate desk", "Her bank", "Mama"];

// at = stop the money is sitting at; kin = the Kin half of the story.
type Beat = { at: number; clock: string; amount: string; title: string; sub: string; kin?: boolean };
const BEATS: Beat[] = [
  { at: 0, clock: "Day 0", amount: "$200.00", title: "Monday, 9am. You send $200 home.", sub: "Mama needs it for a hospital bill due Friday." },
  { at: 1, clock: "Day 1", amount: "$195.00", title: "Your bank takes $5. Then it waits.", sub: "You missed today's cut-off. It leaves tomorrow." },
  { at: 2, clock: "Day 2", amount: "$192.00", title: "It passes through a bank in New York.", sub: "Your bank has no direct line to hers. Every stop takes a cut." },
  { at: 3, clock: "Day 3", amount: "$187.02", title: "Changed at a rate you never saw.", sub: "The biggest fee hides inside the exchange rate." },
  { at: 3, clock: "Day 5", amount: "$187.02", title: "Saturday. Every bank is closed.", sub: "Your money sits still, somewhere in between." },
  { at: 4, clock: "Day 6", amount: "$187.02", title: "Her bank holds it for checks.", sub: "Smaller countries add more stops. Weeks. Sometimes a month." },
  { at: 5, clock: "Day 7", amount: "$187.02", title: "Mama gets $187.02.", sub: "The bill was due three days ago." },
  { at: 5, clock: "1 sec", amount: "$200.00", kin: true, title: "Now send it with Kin.", sub: "Straight from you to Mama. No banks in between. Nothing taken." },
  { at: 5, clock: "Hours", amount: "$200.00", kin: true, title: "Into her bank in hours, not weeks.", sub: "She moves it to her bank in local money and sees the rate before she taps." },
  { at: 5, clock: "Anytime", amount: "$200.00", kin: true, title: "Not needed yet? It waits, and saves.", sub: "Keep it in a jar with her name on it. Ready the second she needs it." },
];

/** Scroll-pinned story: the old way money travels vs Kin. Scroll position picks the beat. */
export function Journey() {
  const ref = useRef<HTMLElement>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    const el = ref.current!;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
      setI(Math.min(BEATS.length - 1, Math.floor(p * BEATS.length)));
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, []);

  const b = BEATS[i];
  const kin = !!b.kin;
  const last = STOPS.length - 1;
  const lost = !kin && b.amount !== "$200.00";
  const ease = "transition-all duration-700 ease-out motion-reduce:transition-none";

  return (
    <section ref={ref} aria-label="How money travels" style={{ height: `${BEATS.length * 70 + 100}svh` }}>
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 md:px-8">
          <p className={`text-xs font-semibold uppercase tracking-widest ${kin ? "text-brand" : "text-muted"}`}>
            {kin ? "With Kin" : "The old way"}
          </p>

          {/* Clock + amount */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Time</p>
              <p className={`font-display text-6xl leading-none tabular-nums md:text-7xl ${kin ? "text-brand" : ""}`}>{b.clock}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted">Mama gets</p>
              <p className={`font-display text-4xl leading-none tabular-nums md:text-5xl ${lost ? "text-bad" : kin ? "text-good" : ""}`}>{b.amount}</p>
              <p className={`mt-1 text-xs font-semibold text-good ${ease} ${kin ? "opacity-100" : "opacity-0"}`}>You kept $12.98</p>
            </div>
          </div>

          {/* Route */}
          <div className="relative h-16">
            <div className="absolute inset-x-[5%] top-2 h-1 rounded-full bg-line" />
            <div
              className={`absolute left-[5%] top-2 h-1 rounded-full ${ease} ${kin ? "bg-brand" : "bg-bad/60"}`}
              style={{ width: `${(b.at / last) * 90}%` }}
            />
            {STOPS.map((s, n) => {
              const middle = n > 0 && n < last;
              return (
                <div
                  key={s}
                  className={`absolute top-0 flex w-16 -translate-x-1/2 flex-col items-center gap-2 ${ease} ${kin && middle ? "scale-50 opacity-0" : ""}`}
                  style={{ left: `${5 + (n / last) * 90}%` }}
                >
                  <span className={`size-5 rounded-full border-4 border-bg ${n <= b.at ? (kin ? "bg-brand" : "bg-bad") : "bg-line"}`} />
                  <span className="text-center text-[11px] leading-tight text-muted">{s}</span>
                </div>
              );
            })}
            <span
              aria-hidden
              className={`absolute top-0 grid size-5 -translate-x-1/2 place-items-center rounded-full text-[10px] font-bold text-white shadow-lg ${ease} ${kin ? "bg-brand" : "bg-ink"}`}
              style={{ left: `${5 + (b.at / last) * 90}%` }}
            >
              $
            </span>
          </div>

          {/* Captions: all in the DOM for screen readers, only the current one visible */}
          <ol className="grid">
            {BEATS.map((x, n) => (
              <li key={x.title} className={`[grid-area:1/1] ${ease} ${n === i ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
                <p className="font-display text-3xl leading-tight md:text-4xl">{x.title}</p>
                <p className="mt-2 max-w-md text-muted">{x.sub}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** Sourced numbers that back the story. */
export function Facts() {
  const facts: [string, string, string][] = [
    ["6.5%", "average cost to send $200 across borders", "World Bank, Remittance Prices Worldwide, Q1 2025"],
    ["1 in 3", "cross-border payment services deliver within an hour", "FSB progress report, 2025"],
    ["$0", "to send with Kin. Arrives in a second", "Kin"],
  ];
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {facts.map(([big, what, src]) => (
        <li key={big} className="rounded-[28px] border border-line bg-surface p-5">
          <p className="font-display text-5xl leading-none">{big}</p>
          <p className="mt-2 font-semibold">{what}</p>
          <p className="mt-2 text-xs text-muted">{src}</p>
        </li>
      ))}
    </ul>
  );
}
