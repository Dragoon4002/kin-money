// Spend categories + per-payment labels (category, note) kept on this device only.
// ponytail: localStorage per payment; move to /api/contacts graph if labels must sync across devices.

export const CATEGORIES = [
  { id: "food", label: "Food", emoji: "🍔", bg: "bg-fun-2" },
  { id: "groceries", label: "Groceries", emoji: "🛒", bg: "bg-fun-1" },
  { id: "bills", label: "Bills", emoji: "💡", bg: "bg-fun-5" },
  { id: "rent", label: "Rent", emoji: "🏠", bg: "bg-fun-3" },
  { id: "family", label: "Family", emoji: "👨‍👩‍👧", bg: "bg-fun-4" },
  { id: "education", label: "Education", emoji: "📚", bg: "bg-fun-5" },
  { id: "travel", label: "Travel", emoji: "✈️", bg: "bg-fun-1" },
  { id: "shopping", label: "Shopping", emoji: "🛍️", bg: "bg-fun-4" },
  { id: "gifts", label: "Gifts", emoji: "🎁", bg: "bg-fun-3" },
  { id: "other", label: "Other", emoji: "✨", bg: "bg-fun-2" },
] as const;

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
