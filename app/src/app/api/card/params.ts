// Share-card query validation. Pure (no imports) so scripts/check-card.mts can run it under plain node.

export const KINDS = ["sent", "received", "goal", "gift", "settled", "receipt"] as const;
export type Kind = (typeof KINDS)[number];
export const SKINS = ["classic", "mint", "sunset", "night", "gold"] as const;
/** Mirror of lib/categories ids → labels (kept here: this file has no imports). */
export const CATS: Record<string, string> = {
  food: "Food", groceries: "Groceries", bills: "Bills", rent: "Rent", family: "Family",
  education: "Education", travel: "Travel", shopping: "Shopping", gifts: "Gifts", other: "Other",
};
export const ACCESSORIES = ["scarf", "chain", "shades", "headphones", "cap", "crown", "party", "bow"] as const;

export type Card = {
  kind: Kind;
  amount?: bigint;
  to?: string;
  from?: string;
  secs?: string;
  title?: string;
  cur: string;
  /** Receipt only: the whole printed ticket. */
  out?: boolean;
  note?: string;
  cat?: string;
  when?: string;
  id?: string;
  skin: string;
  accessories: string[];
};

const HANDLE_RE = /^[a-z0-9_]{3,20}$/; // mirror of lib/names HANDLE_RE
const SHORT_ACCOUNT_RE = /^0x[0-9a-f]{4}…[0-9a-f]{4}$/; // receipt only: someone not on Kin, shown short
const clean = (v: string | null, max: number) => v?.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) || undefined;

/** Same hash as lib/kinko lookForName, so a card matches the person's default Kinko. */
const skinFor = (name = "") => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SKINS[h % SKINS.length];
};

/** Validated card params, or null if anything is malformed. Only what the user chose to share. */
export function parseCard(q: URLSearchParams): Card | null {
  const kind = q.get("kind") as Kind;
  if (!KINDS.includes(kind)) return null;

  const raw = q.get("amount");
  if (raw !== null && !/^\d{1,15}$/.test(raw)) return null;

  const receipt = kind === "receipt";
  const handle = (k: string) => {
    const v = q.get(k)?.replace(/^@/, "").toLowerCase();
    if (v === undefined || v === "") return undefined;
    return HANDLE_RE.test(v) || (receipt && SHORT_ACCOUNT_RE.test(v)) ? v : null;
  };
  const to = handle("to");
  const from = handle("from");
  if (to === null || from === null) return null;

  const secs = q.get("secs") ?? undefined;
  if (secs !== undefined && !/^\d{1,2}(\.\d)?$/.test(secs)) return null;

  const title = q.get("title")?.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 40) || undefined;

  // Receipt extras: direction, note (≤200, the app's limit), category id, preformatted local date, payment ID.
  const dir = q.get("dir");
  if (receipt && dir !== "in" && dir !== "out") return null;
  const cat = q.get("cat") ?? undefined;
  if (cat !== undefined && !(cat in CATS)) return null;
  const id = q.get("id")?.toLowerCase() ?? undefined;
  if (id !== undefined && !/^0x[0-9a-f]{64}$/.test(id)) return null;
  const extras = receipt ? { out: dir === "out", note: clean(q.get("note"), 200), cat, when: clean(q.get("when"), 48), id } : {};
  const cur = q.get("cur") ?? "USD";
  if (!/^[A-Z]{3}$/.test(cur)) return null;

  let skin: string = skinFor(from ?? to);
  let accessories: string[] = [];
  const look = q.get("look");
  if (look) {
    try {
      const l = JSON.parse(look) as { skin?: unknown; accessories?: unknown };
      if (typeof l.skin === "string" && (SKINS as readonly string[]).includes(l.skin)) skin = l.skin;
      if (Array.isArray(l.accessories)) accessories = ACCESSORIES.filter((a) => (l.accessories as unknown[]).includes(a));
    } catch {
      return null;
    }
  }

  return { kind, amount: raw === null ? undefined : BigInt(raw), to, from, secs, title, cur, skin, accessories, ...extras };
}
