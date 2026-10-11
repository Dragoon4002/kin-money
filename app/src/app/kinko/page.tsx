"use client";
import { useState } from "react";
import { Kinko, type Look } from "@/components/kinko/Kinko";
import { Button, Ico, Ring, Screen, Tabs } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { ITEMS, LEVELS, useKinko, type Item, type ItemKind } from "@/lib/kinko";

const TABS = [["skin", "Skins"], ["expression", "Expressions"], ["accessory", "Accessories"]] as const;

/** Look with `item` applied (accessories toggle, one per slot). */
function apply(look: Look, item: Item): Look {
  if (item.kind === "skin") return { ...look, skin: item.id };
  if (item.kind === "expression") return { ...look, expression: item.id };
  if (look.accessories.includes(item.id)) return { ...look, accessories: look.accessories.filter((a) => a !== item.id) };
  const sameSlot = ITEMS.filter((i) => i.slot === item.slot).map((i) => i.id);
  return { ...look, accessories: [...look.accessories.filter((a) => !sameSlot.includes(a)), item.id] };
}

const worn = (look: Look, item: Item) =>
  item.kind === "skin" ? look.skin === item.id : item.kind === "expression" ? look.expression === item.id : look.accessories.includes(item.id);

export default function Closet() {
  const { profile } = useRequireAccount();
  const k = useKinko(profile?.address);
  const [tab, setTab] = useState<ItemKind>("skin");
  const [draft, setDraft] = useState<Look | null>(null);
  const [picked, setPicked] = useState<Item | null>(null);

  const look = draft ?? k.look;
  const locked = ITEMS.filter((i) => worn(look, i) && !k.unlocked.has(i.id));
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(k.look);
  const next = LEVELS.find(([min]) => min > k.score);

  function pick(item: Item) {
    setPicked(item);
    setDraft(apply(look, item));
  }

  return (
    <Screen title="Kinko" back="/me">
      <div className="relative flex flex-col items-center rounded-[32px] bg-fun-2/15 px-5 pb-6 pt-8">
        <div className="absolute right-4 top-4">
          <Ring value={k.progress} size={64} stroke={6}>
            <span className="font-display text-2xl leading-none tabular">{k.score}</span>
          </Ring>
        </div>
        <Kinko look={look} size={200} />
        <p className="mt-3 font-display text-3xl leading-none">{k.level}</p>
        <p className="mt-1 text-sm text-muted">
          Kin Score {k.score}
          {next ? ` · ${next[0] - k.score} to ${next[1]}` : " · Top level"}
        </p>
      </div>

      <Tabs value={tab} options={TABS} onChange={setTab} />

      <div className="grid grid-cols-3 gap-3">
        {ITEMS.filter((i) => i.kind === tab).map((item) => {
          const open = k.unlocked.has(item.id);
          const on = worn(look, item);
          return (
            <button
              key={item.id}
              onClick={() => pick(item)}
              aria-pressed={on}
              aria-label={open ? item.label : `${item.label}, locked. ${item.hint}`}
              className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-3xl border-2 transition active:scale-95 ${on ? "border-ink bg-fun-2/15" : "border-transparent bg-surface-2"}`}
            >
              <span className={open ? "" : "opacity-40 grayscale"}>
                <Kinko size={64} look={item.kind === "accessory" ? { skin: look.skin, expression: "smile", accessories: [item.id] } : apply({ ...look, accessories: [] }, item)} />
              </span>
              <span className="text-xs font-semibold">{item.label}</span>
              {!open && <span className="absolute right-2 top-2 text-muted"><Ico name="lock" size={16} /></span>}
            </button>
          );
        })}
      </div>

      {picked && !k.unlocked.has(picked.id) && (
        <p className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
          <Ico name="lock" size={16} className="shrink-0" />
          <span className="min-w-0"><span className="font-semibold text-ink">{picked.label}</span> · {picked.hint}</span>
        </p>
      )}

      <div className="flex items-start gap-3 rounded-2xl bg-fun-2/15 px-4 py-3">
        <Ico name="sparkle" size={18} className="mt-0.5 shrink-0" />
        <p className="min-w-0 text-sm text-muted">
          <span className="font-semibold text-ink">Collectible packs, coming soon.</span> Your Kinko items and Kin Score will turn into packs with rare drops and limited events to collect. Just for fun for now.
        </p>
      </div>

      <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] mt-auto pt-2">
        <Button variant="ink" disabled={!changed || locked.length > 0} onClick={() => (k.setLook(look), setDraft(null), setPicked(null))}>
          {locked.length ? `Unlock ${locked[0].label} to wear` : <span className="inline-flex items-center gap-2"><Ico name={changed ? "sparkle" : "check"} /> {changed ? "Wear" : "Wearing"}</span>}
        </Button>
      </div>
    </Screen>
  );
}
