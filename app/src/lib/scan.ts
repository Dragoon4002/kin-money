// Same rule as HANDLE_RE in names.ts; inlined so this stays dependency-free (and node-testable).
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

// Screens a Kin QR may open. Everything else is rejected ("That's not a Kin code").
const KIN_PATHS = ["/send", "/claim", "/invoice/new", "/chores"];

/** QR text → in-app path (only our own links, or a bare @name), else null. */
export function kinTarget(text: string, origin: string): string | null {
  const t = text.trim();
  const bare = t.replace(/^@/, "").toLowerCase();
  if (HANDLE_RE.test(bare) && !t.includes("/")) return `/send?to=${bare}`;
  try {
    const u = new URL(t);
    if (u.origin !== origin && u.hostname !== "kin-money.vercel.app") return null;
    if (!KIN_PATHS.includes(u.pathname)) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}
