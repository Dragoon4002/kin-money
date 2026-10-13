// Referral collectables. `at` = friends who joined with your link AND made their first payment.
// `crew` = friends shown with your Kinko in the scene (1 = handshake). Rewards are announced, not paid, yet.
export const COLLECTABLES = [
  { id: "handshake", at: 1, crew: 1, title: "What's up, friend", sub: "Your first friend is in. Kinkos shake on it." },
  { id: "gang", at: 3, crew: 2, title: "Gang's here", sub: "Three friends in. Your crew has your back." },
  { id: "crowd", at: 10, crew: 5, title: "The whole crew", sub: "Ten friends in. Kinko's got a crowd." },
] as const;

/** Readable invite link: /invite?u=<handle>. */
export const inviteLink = (origin: string, handle: string) => `${origin}/invite?u=${encodeURIComponent(handle)}`;
