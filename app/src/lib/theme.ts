export type Theme = "system" | "light" | "dark";

export function getTheme(): Theme {
  if (typeof localStorage === "undefined") return "system";
  const t = localStorage.getItem("kin.theme");
  return t === "light" || t === "dark" ? t : "system";
}

export function setTheme(t: Theme) {
  if (t === "system") {
    localStorage.removeItem("kin.theme");
    delete document.documentElement.dataset.theme;
  } else {
    localStorage.setItem("kin.theme", t);
    document.documentElement.dataset.theme = t;
  }
}
