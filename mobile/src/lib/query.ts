/** `{a: "1", b: undefined}` → "a=1". Hermes' URLSearchParams is incomplete, so build the query by hand. */
export const query = (o: Record<string, string | undefined>) =>
  Object.entries(o)
    .filter((e): e is [string, string] => !!e[1])
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
