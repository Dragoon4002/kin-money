"use client";
import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { screenOf } from "@/components/demo/screens";

const toggleTheme = () => {
  const el = document.documentElement;
  const dark = el.dataset.theme ? el.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  el.dataset.theme = dark ? "light" : "dark"; // not persisted (kin.theme untouched)
};

const never = () => () => {};
const btn = "h-9 shrink-0 rounded-full bg-surface-2 px-3 text-xs font-semibold active:scale-95";

export default function DemoScreenPage() {
  return (
    <Suspense>
      <DemoScreen />
    </Suspense>
  );
}

/** `?s=3` opens state 3 (0-based), for links and screenshots. */
function DemoScreen() {
  const { screen } = useParams<{ screen: string }>();
  const s = screenOf(screen);
  const start = Number(useSearchParams().get("s")) || 0;
  const [i, setI] = useState(() => Math.min(start, (s?.states.length ?? 1) - 1));
  const [run, setRun] = useState(0);
  const [auto, setAuto] = useState(false);
  const n = s?.states.length ?? 0;
  // Client-only, like the real screens (they load in effects): fake dates/locale can't mismatch hydration.
  const mounted = useSyncExternalStore(never, () => true, () => false);

  useEffect(() => {
    if (!auto || n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 1800);
    return () => clearInterval(t);
  }, [auto, n]);

  if (!s) notFound();
  const st = s.states[i];

  return (
    <>
      <nav aria-label="Demo controls" className="sticky top-0 z-[60] flex items-center gap-1.5 overflow-x-auto border-b border-line bg-bg/90 px-2 py-1.5 backdrop-blur [scrollbar-width:none]">
        <Link href="/demo" className={`grid place-items-center ${btn}`}>‹ Demo</Link>
        <button className={btn} onClick={() => setRun((r) => r + 1)}>Replay</button>
        {n > 1 && (
          <>
            <button className={btn} onClick={() => setI((x) => (x + 1) % n)}>Next state</button>
            <button className={`${btn} ${auto ? "bg-ink! text-bg" : ""}`} onClick={() => setAuto((a) => !a)}>{auto ? "Stop" : "Auto-play"}</button>
          </>
        )}
        <button className={btn} onClick={toggleTheme}>Theme</button>
        <span className="truncate px-1 text-xs text-muted">{n > 1 ? `${i + 1}/${n} ${st.label}` : s.title}</span>
      </nav>
      <div key={`${i}:${run}`} className="flex flex-1 flex-col">{mounted && st.render()}</div>
    </>
  );
}
