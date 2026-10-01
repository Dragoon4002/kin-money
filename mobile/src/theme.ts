import { useColorScheme } from "react-native";

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

// ponytail: Instrument Serif / Plus Jakarta Sans aren't installed (@expo-google-fonts); system fonts until added.
export const fonts = { serif: "serif", sans: undefined } as const;

/** Dark-first: anything but an explicit light scheme gets dark. */
export function useTheme(): Theme {
  return useColorScheme() === "light" ? light : dark;
}
