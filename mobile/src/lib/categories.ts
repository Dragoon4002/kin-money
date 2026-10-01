import * as SecureStore from "expo-secure-store";
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

export const setCategory = (hash: string, id: CategoryId) => SecureStore.setItemAsync(`kin.cat.${hash.toLowerCase()}`, id);
