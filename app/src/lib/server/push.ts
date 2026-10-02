import webpush from "web-push";
import { getAddress, isAddressEqual, toEventSelector, type Address, type RpcLog } from "viem";
import type { contracts } from "./history";

// Push notifications: web (VAPID via web-push) + Android/iOS app (Expo push service).
// Subscriptions: (:Person {address})-[:PUSH]->(:PushSub {id, kind, json, at}); id = web endpoint or Expo token.
// Only package imports at top level so scripts/check-push.mts can load messageFor() under plain node;
// graph/names/chain are imported lazily inside the functions that need them.

export type Msg = { title: string; body: string; url?: string; tag?: string };
type Sub = { id: string; kind: "web" | "expo"; json: string };

let vapid: boolean | null = null;
function vapidReady(): boolean {
  if (vapid !== null) return vapid;
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  vapid = Boolean(pub && priv && subject);
  if (vapid) webpush.setVapidDetails(subject!, pub!, priv!);
  return vapid;
}

/** Send `msg` to every device of `to`. Never throws. Drops subscriptions the push service says are gone. */
export async function notify(to: Address | string, msg: Msg): Promise<void> {
  try {
    const { graphEnabled, q } = await import("./graph");
    if (!graphEnabled()) return;
    const subs = await q<Sub>("MATCH (:Person {address: $a})-[:PUSH]->(s:PushSub) RETURN s.id AS id, s.kind AS kind, s.json AS json", {
      a: getAddress(to),
    });
    const dead: string[] = [];
    const web = vapidReady() ? subs.filter((s) => s.kind === "web") : [];
    const expo = subs.filter((s) => s.kind === "expo");
    await Promise.all([
      ...web.map((s) =>
        webpush.sendNotification(JSON.parse(s.json), JSON.stringify(msg), { TTL: 3600, urgency: "high" }).catch((e: { statusCode?: number }) => {
          if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.id);
        }),
      ),
      expo.length &&
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(expo.map((s) => ({ to: s.json, title: msg.title, body: msg.body, data: { url: msg.url }, sound: "default", priority: "high" }))),
        })
          .then((r) => r.json() as Promise<{ data?: { details?: { error?: string } }[] }>)
          .then((j) => j.data?.forEach((t, i) => t.details?.error === "DeviceNotRegistered" && dead.push(expo[i].id)))
          .catch(() => {}),
    ]);
    if (dead.length) await q("MATCH (s:PushSub) WHERE s.id IN $dead DETACH DELETE s", { dead });
  } catch {
    // ponytail: best effort — a missed alert never blocks money moving.
  }
}

// ---------- onchain event → message ----------

const TRANSFER = toEventSelector("Transfer(address,address,uint256)");
const REQUESTED = toEventSelector("Requested(uint256,address)");
const BOUND = toEventSelector("Bound(uint256,address)");
const COLLECTED = toEventSelector("Collected(uint256,address,uint16,uint256)");
const ZERO = "0x0000000000000000000000000000000000000000";

/** Everything messageFor needs from the outside world (injected so the mapping is testable offline). */
export type Ctx = {
  c: ReturnType<typeof contracts>;
  name: (a: Address) => Promise<string>; // "" when no @name
  money: (units: bigint) => string;
  escrow: (id: bigint) => Promise<{ from: Address; approver: Address; unlockAt: number }>;
  mandatePayer: (id: bigint) => Promise<Address>;
  giftFrom: (id: bigint) => Promise<Address>;
};

const topicAddr = (t?: string) => getAddress(`0x${(t ?? "").slice(26)}`);
const topicNum = (t?: string) => BigInt(t ?? "0x0");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Who to tell what about one indexed log, or null if it's not worth a notification. */
export async function messageFor(log: RpcLog, ctx: Ctx): Promise<{ to: Address; msg: Msg } | null> {
  const { c } = ctx;
  const [t0, t1, t2] = log.topics;
  const who = async (a: Address, fallback: string) => {
    const n = await ctx.name(a).catch(() => "");
    return n ? `@${n}` : fallback;
  };
  const tag = `${log.transactionHash}:${log.logIndex}`;

  if (same(log.address, c.transfers) && t0 === TRANSFER) {
    const [from, to] = [topicAddr(t1), topicAddr(t2)];
    const kin = Object.entries(c).filter(([k, v]) => k !== "transfers" && v).map(([, v]) => v);
    if (same(from, ZERO) || isAddressEqual(from, to) || kin.some((k) => same(k, from) || same(k, to))) return null;
    const amount = ctx.money(BigInt(log.data));
    const n = await who(from, "");
    return { to, msg: { title: n ? `You got ${amount} from ${n}` : `You got ${amount}`, body: "It's in your balance.", url: "/activity", tag } };
  }
  if (same(log.address, c.escrow) && t0 === REQUESTED) {
    const e = await ctx.escrow(topicNum(t1));
    const kid = await who(topicAddr(t2), "Someone");
    const to = same(e.approver, ZERO) ? e.from : e.approver;
    const t = `escrow-${topicNum(t1)}`;
    if (e.unlockAt === 1) return { to, msg: { title: `${kid} says the chore is done`, body: "Take a look and OK it.", url: "/chores", tag: t } };
    if (same(e.approver, e.from)) return { to, msg: { title: `${kid} is asking for emergency money`, body: "Tap to OK it.", url: "/allowance", tag: t } };
    return { to, msg: { title: `${kid} is asking you to OK a payment`, body: "Tap to take a look.", url: "/activity", tag: t } };
  }
  if (same(log.address, c.giftlink) && t0 === BOUND) {
    const from = await ctx.giftFrom(topicNum(t1));
    const n = await who(topicAddr(t2), "Someone");
    return { to: from, msg: { title: `${n} accepted your gift`, body: "Your gift found its person.", url: "/gift", tag } };
  }
  if (same(log.address, c.mandate) && t0 === COLLECTED) {
    const payer = await ctx.mandatePayer(topicNum(t1));
    const total = BigInt(`0x${log.data.slice(66, 130) || "0"}`);
    const n = await who(payer, "someone");
    return { to: topicAddr(t2), msg: { title: `AutoPay: ${ctx.money(total)} from ${n} arrived`, body: "It's in your balance.", url: "/autopay", tag } };
  }
  return null;
}

/** Called by history.save() with freshly indexed, recent, not-yet-notified logs. Never throws. */
export async function notifyLogs(logs: RpcLog[], c: Ctx["c"]): Promise<void> {
  try {
    const [{ verifiedName }, { formatMoney }, { publicClient, addr }, abi] = await Promise.all([
      import("./graph"),
      import("../money"),
      import("../chain"),
      import("../abi"),
    ]);
    const names = new Map<string, Promise<string>>();
    const ctx: Ctx = {
      c,
      name: (a) => {
        if (!names.has(a)) names.set(a, verifiedName(a).then((n) => n ?? ""));
        return names.get(a)!;
      },
      money: (u) => formatMoney(u, "USD"),
      escrow: async (id) => {
        const [from, unlockAt, , , , , , approver] = await publicClient.readContract({ address: addr.escrow, abi: abi.KinEscrowAbi, functionName: "escrows", args: [id] });
        return { from, approver, unlockAt };
      },
      mandatePayer: async (id) =>
        (await publicClient.readContract({ address: addr.mandate, abi: abi.KinMandateAbi, functionName: "mandates", args: [id] }))[0],
      giftFrom: async (id) => (await publicClient.readContract({ address: addr.giftlink, abi: abi.KinGiftLinkAbi, functionName: "gifts", args: [id] }))[0],
    };
    await Promise.all(
      logs.map(async (l) => {
        const m = await messageFor(l, ctx).catch(() => null);
        if (m) await notify(m.to, m.msg);
      }),
    );
  } catch {}
}
