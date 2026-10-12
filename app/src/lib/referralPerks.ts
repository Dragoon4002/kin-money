// Referral perks config. `at` = friends who joined with your link AND made their first payment.
// Display only for now: payout of the jar bonus is not wired yet.
export const PERKS = [
  { at: 1, label: "Party hat for Kinko" },
  { at: 3, label: "1% bonus on your next jar deposit" },
  { at: 5, label: "2% bonus on your next jar deposit" },
  { at: 10, label: "3% bonus on your next jar deposit" },
] as const;

/** Readable invite link: /invite?u=<handle>. */
export const inviteLink = (origin: string, handle: string) => `${origin}/invite?u=${encodeURIComponent(handle)}`;
