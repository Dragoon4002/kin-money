// Port of app/src/lib/referralPerks.ts. `at` = friends who joined with your link AND made their first payment.
// `crew` = friends shown with your Kinko in the scene (1 = handshake). Rewards are announced, not paid, yet.
export const COLLECTABLES = [
  { id: "handshake", at: 1, crew: 1, title: "What's up, friend", sub: "Your first friend is in. Kinkos shake on it." },
  { id: "gang", at: 3, crew: 2, title: "Gang's here", sub: "Three friends in. Your crew has your back." },
  { id: "crowd", at: 10, crew: 5, title: "The whole crew", sub: "Ten friends in. Kinko's got a crowd." },
] as const;
export type Collectable = (typeof COLLECTABLES)[number];

/** /api/invites; `active` = made a payment (server sends it; lib/contacts' `Invites` predates it). */
export type RefInvites = { invited: { name: string; at: number; active?: boolean }[]; invitedBy: string | null };
