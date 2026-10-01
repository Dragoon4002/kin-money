import type { IconName } from "@/lib/icons";

// Spend categories + per-payment labels (category, note) kept on this device only.
// ponytail: localStorage per payment; move to /api/contacts graph if labels must sync across devices.

export const CATEGORIES = [
  { id: "food", label: "Food", icon: "food" },
  { id: "groceries", label: "Groceries", icon: "groceries" },
  { id: "bills", label: "Bills", icon: "bills" },
  { id: "rent", label: "Rent", icon: "rent" },
  { id: "family", label: "Family", icon: "family" },
  { id: "education", label: "Education", icon: "education" },
  { id: "travel", label: "Travel", icon: "travel" },
  { id: "shopping", label: "Shopping", icon: "shopping" },
  { id: "gifts", label: "Gifts", icon: "gifts" },
  { id: "other", label: "Other", icon: "other" },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

export type Category = (typeof CATEGORIES)[number];
export type CategoryId = Category["id"];

const OTHER = CATEGORIES[CATEGORIES.length - 1];
const ls = () => (typeof localStorage === "undefined" ? null : localStorage);

/** Category for a payment; uncategorized → Other. */
export function categoryOf(hash: string): Category {
  const id = ls()?.getItem(`kin.cat.${hash.toLowerCase()}`);
  return CATEGORIES.find((c) => c.id === id) ?? OTHER;
}

/** True when the user picked a category for this payment. */
export const hasCategory = (hash: string) => !!ls()?.getItem(`kin.cat.${hash.toLowerCase()}`);

export function setCategory(hash: string, id: CategoryId) {
  ls()?.setItem(`kin.cat.${hash.toLowerCase()}`, id);
}

export const noteOf = (hash: string) => ls()?.getItem(`kin.note.${hash.toLowerCase()}`) ?? "";

export function setNote(hash: string, note: string) {
  if (note.trim()) ls()?.setItem(`kin.note.${hash.toLowerCase()}`, note.trim());
}
