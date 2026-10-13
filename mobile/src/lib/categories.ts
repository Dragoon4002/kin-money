import * as SecureStore from "expo-secure-store";
import { trackKey } from "./account";
import { Gift, GraduationCap, HeartHandshake, House, Plane, Receipt, Shapes, ShoppingBag, ShoppingBasket, Utensils } from "lucide-react-native";

// Spend categories: same ids/labels/icons as app/src/lib/categories.ts (+ lib/icons.ts).
// ponytail: kept on this device only (SecureStore per payment hash), like web's localStorage.

export const CATEGORIES = [
  { id: "food", label: "Food", icon: Utensils },
  { id: "groceries", label: "Groceries", icon: ShoppingBasket },
  { id: "bills", label: "Bills", icon: Receipt },
  { id: "rent", label: "Rent", icon: House },
  { id: "family", label: "Family", icon: HeartHandshake },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "travel", label: "Travel", icon: Plane },
  { id: "shopping", label: "Shopping", icon: ShoppingBag },
  { id: "gifts", label: "Gifts", icon: Gift },
  { id: "other", label: "Other", icon: Shapes },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function setCategory(hash: string, id: CategoryId) {
  const k = `kin.cat.${hash.toLowerCase()}`;
  trackKey(k);
  return SecureStore.setItemAsync(k, id);
}

// Note on a payment (this phone only), same key as web. Empty note deletes it.
export function noteOf(hash: string) {
  try {
    return SecureStore.getItem(`kin.note.${hash.toLowerCase()}`) ?? "";
  } catch {
    return "";
  }
}
export function setNote(hash: string, note: string) {
  const k = `kin.note.${hash.toLowerCase()}`;
  if (!note.trim()) return SecureStore.deleteItemAsync(k);
  trackKey(k);
  return SecureStore.setItemAsync(k, note.trim());
}
