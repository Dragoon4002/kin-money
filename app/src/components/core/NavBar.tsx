"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui";

const ICONS = {
  Home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  Money: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h3",
  Explore: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  Activity: "M4 6h16M4 12h16M4 18h10",
} as const;

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const LEFT = [["Home", "/home"], ["Money", "/money"]] as const;
const RIGHT = [["Explore", "/explore"], ["Activity", "/activity"]] as const;

/** Floating pill nav for top-level screens. Render after <Screen> (which reserves bottom space). */
export function NavBar() {
  const path = usePathname();
  const tab = ([label, href]: readonly [keyof typeof ICONS, string]) => {
    const on = path.startsWith(href);
    return (
      <Link key={href} href={href} aria-current={on ? "page" : undefined}
        className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition active:scale-95 ${on ? "text-ink" : "text-muted"}`}>
        <Icon d={ICONS[label]} />
        {label}
      </Link>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto w-[calc(100%-2rem)] max-w-sm">
      <div className="grid grid-cols-5 items-center rounded-full border border-line bg-surface/80 px-2 shadow-lg shadow-ink/10 backdrop-blur-xl">
        {LEFT.map(tab)}
        <Link href="/send" aria-label="Pay someone"
          className="mx-auto -mt-7 grid size-16 place-items-center rounded-full border-4 border-bg bg-brand text-brand-ink shadow-lg shadow-brand/30 transition active:scale-95">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
        {RIGHT.map(tab)}
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
