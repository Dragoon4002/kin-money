"use client";
// /demo registry: every screen id → its states, each a render of the proposed pure views with fake data.
// Side effects are no-ops here: no storage writes, no fetches against fake hashes, no chain calls.
// Shipped/approved screens are off the index; their files (EActivity, ECashout, ECashin, Slip, …) stay as the port source.
import type { ReactNode } from "react";
import { GIFT_STATES } from "./EGift";
import { LINK_STATES } from "./ELink";

export type DemoState = { label: string; render: () => ReactNode };
export type DemoScreen = { id: string; group: string; title: string; states: DemoState[]; /** Real route for /demo/compare. */ real?: string; /** One line on the index. */ desc?: string };

export const SCREENS: DemoScreen[] = [
  { id: "e-gift", group: "Section E (new model)", title: "E1 Gifts: note → fold → box → on its way, open (every state)", real: "/gift",
    desc: "Gift note on paper → Send gift: it folds, drops into a box, the box flies off → who it reaches + countdown; open a gift link: the box lands, bursts open, the card rises → Accept", states: GIFT_STATES },
  { id: "e-link", group: "Section E (new model)", title: "E1 Pay: to a person or as a link", real: "/send",
    desc: "Real Pay look: to a person or a pasted account (pick, amount, note → receipt ticket) or as a link → link ready (WhatsApp, share) + collect (real claim screen) + sender's take-back", states: LINK_STATES },
];

export const screenOf = (id: string) => SCREENS.find((s) => s.id === id);
