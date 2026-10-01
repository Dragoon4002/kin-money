"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, Ico } from "@/components/ui";
import type { IconName } from "@/lib/icons";

const ICONS: Record<string, IconName> = { Money: "money", Explore: "explore", Home: "home", People: "people", Activity: "activity" };

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

const tabIndex = (path: string) => {
  const p = ALIAS[path] ?? path;
  const i = TABS.findIndex(([, href]) => p.startsWith(href));
  return i < 0 ? 2 : i;
};

/**
 * Carousel nav: the active tab slides to the center at 1.3×. Swipe left/right anywhere on a tab
 * screen to move between tabs. Render after <Screen> (which reserves bottom space).
 */
export function NavBar() {
  const path = usePathname();
  const router = useRouter();
  const target = tabIndex(path);
  // Persistent (rendered once in app/(tabs)/layout.tsx). `idx` leads the route so the strip moves on tap.
  const [idx, setIdx] = useState(target);
  const [prevTarget, setPrevTarget] = useState(target);
  if (prevTarget !== target) {
    setPrevTarget(target);
    setIdx(target);
  }

  // Clear the page slide-in flag once the new page has animated in.
  useEffect(() => {
    const t = setTimeout(() => delete document.documentElement.dataset.navdir, 350);
    return () => clearTimeout(t);
  }, [target]);

  function go(i: number) {
    if (i < 0 || i >= TABS.length || i === idx) return;
    document.documentElement.dataset.navdir = i > idx ? "next" : "prev"; // see globals.css
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
                    <Ico name={ICONS[label]} size={24} />
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
