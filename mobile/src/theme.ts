import * as SecureStore from "expo-secure-store";
import { Appearance, useColorScheme } from "react-native";

// Same token values as app/src/app/globals.css (light, dark).
const light = {
  bg: "#faf7f3",
  surface: "#ffffff",
  surface2: "#f3eee8",
  line: "#e9e2d9",
  ink: "#1b1815",
  muted: "#776e66",
  brand: "#e2573b",
  brandInk: "#ffffff",
  brandSoft: "rgba(226,87,59,0.14)",
  good: "#1f9d6b",
  bad: "#d64545",
  warn: "#c9851a",
  qrInk: "#1b1530",
  qrBg: "#ffffff",
};
export type Theme = typeof light;
const dark: Theme = {
  ...light,
  bg: "#0d0c0b",
  surface: "#171513",
  surface2: "#201d1a",
  line: "#2b2723",
  ink: "#f6f1ea",
  muted: "#9a9088",
  brand: "#ec6a4f",
  brandSoft: "rgba(236,106,79,0.14)",
  good: "#3cc28a",
  bad: "#f06a6a",
  warn: "#f0b445",
};

// Loaded in app/_layout.tsx (@expo-google-fonts). One family per weight: custom fonts ignore fontWeight on Android.
export const fonts = {
  serif: "InstrumentSerif_400Regular",
  sans: { "400": "PlusJakartaSans_400Regular", "500": "PlusJakartaSans_500Medium", "600": "PlusJakartaSans_600SemiBold", "700": "PlusJakartaSans_700Bold", "800": "PlusJakartaSans_800ExtraBold" } as Record<string, string>,
} as const;

/** Dark-first: anything but an explicit light scheme gets dark. */
export function useTheme(): Theme {
  return useColorScheme() === "light" ? light : dark;
}

// Settings → Appearance. Stored per phone; "system" follows the phone.
export type ThemePref = "system" | "light" | "dark";
export function getThemePref(): ThemePref {
  try {
    const v = SecureStore.getItem("kin.theme");
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
export function setThemePref(p: ThemePref) {
  SecureStore.setItem("kin.theme", p);
  Appearance.setColorScheme(p === "system" ? "unspecified" : p);
}
if (getThemePref() !== "system") Appearance.setColorScheme(getThemePref() as "light" | "dark");
