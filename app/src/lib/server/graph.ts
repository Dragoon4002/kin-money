import "server-only";
import { createHmac } from "node:crypto";
import neo4j, { type Driver } from "neo4j-driver";
import { getAddress, isAddress, isHex, verifyMessage, type Address } from "viem";
import { nameOf } from "../names";

// Phonebook graph (docs/ARCHITECTURE.md → Graph model). Optional: with no NEO4J_* env,
// every route answers empty/ok so the app still works.

const { NEO4J_URI, NEO4J_PASSWORD, PHONE_HASH_SECRET } = process.env;
const NEO4J_USER = process.env.NEO4J_USER ?? process.env.NEO4J_USERNAME; // Aura's credentials file uses NEO4J_USERNAME

export const graphEnabled = () => Boolean(NEO4J_URI && NEO4J_USER && NEO4J_PASSWORD);

let driver: Driver | null = null;
let ready: Promise<unknown> | null = null;

/** Run parameterised Cypher; rows as plain objects. */
export async function q<T = Record<string, unknown>>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  if (!driver) {
    driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USER!, NEO4J_PASSWORD!), { disableLosslessIntegers: true });
    ready = driver.executeQuery("CREATE CONSTRAINT person_address IF NOT EXISTS FOR (p:Person) REQUIRE p.address IS UNIQUE");
  }
  await ready;
  const { records } = await driver.executeQuery(cypher, params);
  return records.map((r) => r.toObject() as T);
}

/** Upsert the caller + optional other person with onchain-verified names. Prefix for write queries. */
export const UPSERT_ME = `
MERGE (me:Person {address: $me}) ON CREATE SET me.createdAt = timestamp()
SET me.name = coalesce($meName, me.name)`;
export const UPSERT_THEM = `
MERGE (p:Person {address: $them}) ON CREATE SET p.createdAt = timestamp()
SET p.name = coalesce($themName, p.name)`;

/** Onchain @name for an address (never trust client-supplied names), or null. */
export async function verifiedName(a: Address): Promise<string | null> {
  return (await nameOf(a).catch(() => "")) || null;
}

/** Phone numbers are only ever stored as HMAC-SHA256(secret, E.164). */
export function phoneHash(phone: unknown): string | null {
  if (typeof phone !== "string" || !PHONE_HASH_SECRET) return null;
  const e164 = phone.replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) return null;
  return createHmac("sha256", PHONE_HASH_SECRET).update(e164).digest("hex");
}

/** Caller address from `x-kin-*` headers (EIP-191 over `Kin contacts <address> <ts>`, ±300s), or null. */
export async function authed(req: Request): Promise<Address | null> {
  const a = req.headers.get("x-kin-address") ?? "";
  const tsRaw = req.headers.get("x-kin-ts") ?? "";
  const sig = req.headers.get("x-kin-sig") ?? "";
  const ts = Number(tsRaw);
  if (!isAddress(a) || !isHex(sig) || !/^\d{9,11}$/.test(tsRaw) || Math.abs(Date.now() / 1000 - ts) > 300) return null;
  const ok = await verifyMessage({ address: a, message: `Kin contacts ${a} ${tsRaw}`, signature: sig }).catch(() => false);
  return ok ? getAddress(a) : null;
}

/** Checksummed address from untrusted input, or null. */
export const addrOf = (v: unknown): Address | null => (typeof v === "string" && isAddress(v) ? getAddress(v) : null);

/** Positive integer amount in base units, as a string (≤ 1e9 dollars so Cypher toInteger is safe). */
export const validAmount = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d{0,14}$/.test(v);

/** Shared route wrapper: auth → graph-off fallback → run → JSON. Never leaks internals. */
export async function route(req: Request, empty: unknown, fn: (me: Address, body: Record<string, unknown>) => Promise<Response | unknown>): Promise<Response> {
  const me = await authed(req);
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!graphEnabled()) return Response.json(empty);
  const body = req.method === "GET" ? {} : await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "invalid" }, { status: 400 });
  try {
    const out = await fn(me, body);
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    console.error("graph failed", (e as Error).message?.slice(0, 300));
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}

export const bad = (error = "invalid", status = 400) => Response.json({ error }, { status });
