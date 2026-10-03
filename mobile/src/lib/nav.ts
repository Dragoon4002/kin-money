import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { goTab, type Tab } from "@/components/NavBar";
import { API_BASE } from "./config";

// Web path → native route. `[id]` matches one path segment (passed as param `id`).
// Page agents: add ONE line per ported page, keep it a flat literal. Anything not listed opens the web app.
export const NATIVE: Record<string, string> = {
  "/send": "/send",
  "/inbox": "/inbox",
  "/messages": "/messages",
  "/receive": "/receive",
  "/scan": "/scan",
  "/security": "/security",
  "/kinko": "/closet",
  "/me": "/more",
  "/trips": "/trips",
  "/trips/[id]": "/trips/[id]",
  "/split": "/split",
  "/gift": "/gift",
  "/gift/open": "/gift/open",
  "/invoice": "/invoice",
  "/invoice/new": "/invoice/new",
  "/invoice/[id]": "/invoice/[id]",
  "/claim": "/claim",
  "/pot": "/pot",
  "/pot/join": "/pot/join",
  "/pot/[id]": "/pot/[id]",
  "/jars": "/jars",
  "/jars/[id]": "/jars/[id]",
  "/circle": "/circle",
  "/circle/join": "/circle/join",
  "/circle/[id]": "/circle/[id]",
  "/details": "/details",
  "/requests": "/requests",
  "/request": "/request",
  "/cashout": "/cashout",
  "/invite": "/invite",
  "/settings": "/settings",
  "/spends": "/spends",
  "/allowance": "/allowance",
  "/allowance/[id]": "/allowance/[id]",
  "/chores": "/chores",
  "/chores/[id]": "/chores/[id]",
  "/autopay": "/autopay",
  "/autopay/[id]": "/autopay/[id]",
  "/earmark": "/earmark",
};

const TAB: Record<string, Tab> = { "/money": "Money", "/explore": "Explore", "/home": "Home", "/contacts": "People", "/activity": "Activity" };

/** "a=1&b=x%20y" → { a: "1", b: "x y" }. Hermes' URLSearchParams is incomplete. */
function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of qs.split("&")) {
    if (!kv) continue;
    const i = kv.indexOf("=");
    const k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? "" : kv.slice(i + 1);
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
    } catch {} // malformed pair: skip it
  }
  return out;
}

/**
 * Open a Kin link or path ("/pot/12?x=1#frag", or a full kin-money.vercel.app url): native screen if NATIVE has it,
 * else the web app in a Custom Tab. Query → route params; `#fragment` → param `hash` (no leading #).
 * `replace`: swap out the current screen (for the web fallback, it closes once the tab is dismissed).
 */
export function openKin(url: unknown, { replace = false } = {}) {
  if (typeof url !== "string" || !url) return;
  // ponytail: string parse, RN's URL polyfill is partial. Only our own pages; anything else is ignored.
  const path = url.startsWith(API_BASE + "/") ? url.slice(API_BASE.length) : url.startsWith("/") && !url.startsWith("//") ? url : null;
  if (!path) return;
  const [beforeHash, hash] = [path.split("#")[0], path.split("#").slice(1).join("#")];
  const [bare, qs = ""] = beforeHash.split("?");
  const params = parseQuery(qs);
  if (hash) params.hash = hash;
  const go = (href: Href) => (replace ? router.replace(href) : router.push(href));

  const chat = bare.match(/^\/messages\/([^/]+)$/);
  if (chat) return go({ pathname: "/chat", params: { with: decodeURIComponent(chat[1]) } });
  if (TAB[bare]) return goTab(TAB[bare]);
  if (NATIVE[bare]) return go({ pathname: NATIVE[bare], params } as Href);
  const id = bare.match(/^(.*)\/([^/]+)$/);
  const dyn = id && NATIVE[`${id[1]}/[id]`];
  if (dyn) return go({ pathname: dyn, params: { ...params, id: decodeURIComponent(id[2]) } } as Href);
  void WebBrowser.openBrowserAsync(API_BASE + path).then(() => {
    if (replace) router.back();
  });
}
