"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui";

const ICONS = {
  Money: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h3",
  Explore: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  Home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  People: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.9M15.5 3.1a3.5 3.5 0 0 1 0 6.8",
  Activity: "M4 6h16M4 12h16M4 18h10",
} as const;

/** Swipeable tab order. Home sits in the middle so the strip starts balanced. */
const TABS = [
  ["Money", "/money"],
  ["Explore", "/explore"],
  ["Home", "/home"],
  ["People", "/contacts"],
  ["Activity", "/activity"],
] as const;

// Sub-pages that belong to a tab (keeps that tab centered).
const ALIAS: Record<string, string> = { "/spends": "/activity" };

const SLOT = 76; // px between icon centers
const KEY = "kin.navIdx";
const DIR = "kin.navDir";

const tabIndex = (path: string) => {
  const p = ALIAS[path] ?? path;
  const i = TABS.findIndex(([, href]) => p.startsWith(href));
  return i < 0 ? 2 : i;
};

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const read = (k: string) => {
  try { return sessionStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string) => {
  try { sessionStorage.setItem(k, v); } catch {}
};

/**
 * Carousel nav: the active tab slides to the center at 1.3×. Swipe left/right anywhere on a tab
 * screen to move between tabs. Render after <Screen> (which reserves bottom space).
 */
export function NavBar() {
  const path = usePathname();
  const router = useRouter();
  const target = tabIndex(path);
  // Start from the previous tab's position so the strip animates across page changes (NavBar remounts per page).
  const [idx, setIdx] = useState(() => {
    const prev = Number(read(KEY));
    return Number.isInteger(prev) && prev >= 0 && prev < TABS.length ? prev : target;
  });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIdx(target));
    write(KEY, String(target));
    // Page slide-in direction (see globals.css [data-navdir]).
    const dir = read(DIR);
    if (dir) {
      document.documentElement.dataset.navdir = dir;
      write(DIR, "");
      setTimeout(() => delete document.documentElement.dataset.navdir, 350);
    }
    return () => cancelAnimationFrame(raf);
  }, [target]);

  function go(i: number) {
    if (i < 0 || i >= TABS.length || i === idx) return;
    write(DIR, i > idx ? "next" : "prev");
    setIdx(i); // move the strip immediately, don't wait for the route
    router.push(TABS[i][1]);
  }

  // Swipe between tabs.
  useEffect(() => {
    let x = 0, y = 0, t = 0, skip = false;
    const start = (e: TouchEvent) => {
      const el = e.target as HTMLElement;
      x = e.touches[0].clientX; y = e.touches[0].clientY; t = Date.now();
      // Leave screen edges to the OS/browser back gesture; leave sideways scrollers alone.
      skip = x < 24 || x > window.innerWidth - 24 || !!el.closest("input, textarea, select, [data-noswipe], .overflow-x-auto");
    };
    const end = (e: TouchEvent) => {
      if (skip) return;
      const dx = e.changedTouches[0].clientX - x, dy = e.changedTouches[0].clientY - y;
      if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - t > 700) return;
      go(target + (dx < 0 ? 1 : -1));
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    return () => { window.removeEventListener("touchstart", start); window.removeEventListener("touchend", end); };
  });

  useEffect(() => {
    for (const i of [target - 1, target + 1]) if (TABS[i]) router.prefetch(TABS[i][1]);
  }, [target, router]);

  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md">
      <div className="h-28 bg-gradient-to-t from-bg via-bg/90 to-transparent pb-[env(safe-area-inset-bottom)]">
        <div className="relative h-full overflow-hidden">
          <ul
            className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 flex items-center transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${-(idx * SLOT + SLOT / 2)}px)` }}
          >
            {TABS.map(([label, href], i) => {
              const on = i === idx;
              return (
                <li key={href} className="grid place-items-center" style={{ width: SLOT }}>
                  <Link
                    href={href}
                    onClick={(e) => { e.preventDefault(); go(i); }}
                    aria-label={label}
                    aria-current={on ? "page" : undefined}
                    className={`grid size-14 place-items-center rounded-full border transition-all duration-300 ease-out motion-reduce:transition-none active:opacity-80 ${
                      on ? "scale-[1.3] border-transparent bg-ink text-bg shadow-lg shadow-ink/20" : "border-line bg-surface-2 text-muted"
                    }`}
                  >
                    <Icon d={ICONS[label]} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}

/** Top-right avatar → /me (Home, Money, Explore). */
export function MeButton({ name }: { name?: string }) {
  return (
    <Link href="/me" aria-label="Me and settings" className="grid size-11 place-items-center rounded-full active:scale-95">
      <Avatar name={name} size={40} />
    </Link>
  );
}
