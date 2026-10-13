"use client";
import Link from "next/link";
import { Band, Screen } from "@/components/ui";
import { SCREENS } from "@/components/demo/screens";

export default function DemoIndex() {
  const groups = [...new Set(SCREENS.map((s) => s.group))];
  return (
    <Screen wide title="Demo screens">
      <p className="px-5 text-sm text-muted">Fake data only. Nothing here moves money.</p>
      {groups.map((g) => (
        <section key={g} className="flex flex-col">
          <Band>{g}</Band>
          {SCREENS.filter((s) => s.group === g).map((s) => (
            <div key={s.id} className="flex min-h-16 items-center gap-3 px-5 py-2">
              <Link href={`/demo/${s.id}`} className="min-w-0 flex-1 py-2">
                <span className="block truncate font-semibold">{s.title}</span>
                <span className="block truncate text-sm text-muted">{s.id}{s.states.length > 1 ? ` · ${s.states.length} states` : ""}</span>
                {s.desc && <span className="block text-sm text-muted">{s.desc}</span>}
              </Link>
              {s.real && (
                <Link href={`/demo/compare/${s.id}`} className="grid h-11 place-items-center rounded-full bg-surface-2 px-4 text-sm font-semibold active:scale-95">Compare</Link>
              )}
            </div>
          ))}
        </section>
      ))}
    </Screen>
  );
}
