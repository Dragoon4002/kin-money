"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { Bubble, useSignedIn } from "@/components/social/bits";
import { Avatar, Button, Card, Chip, ErrorText, Ico } from "@/components/ui";
import { unlock, useAccount } from "@/lib/account";
import { recordPayment, settleRequest } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { isLive, listMessages, listThreads, markThreadRead, onLive, sendMessage, setThread, type ChatMessage, type Thread } from "@/lib/live";
import { formatMoney } from "@/lib/money";
import { nameOf, resolveName } from "@/lib/names";
import { sendDollars } from "@/lib/tx";

type Shown = ChatMessage & { pending?: boolean; failed?: boolean };

/** Optimistic bubble shown until the server answers. */
function draft(from: Address, to: Address, body: string, id?: string): Shown {
  const at = Date.now();
  return { id: id ?? `tmp-${at}`, from, to, body, kind: "text", ref: "", at, pending: true };
}

const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Chat with one person: texts, money requests (Pay / Decline) and payments. `who` = account or @name. */
export default function ChatPage() {
  const profile = useSignedIn();
  const me = profile?.address;
  const { canRead } = useAccount();
  const who = decodeURIComponent(useParams<{ who: string }>().who ?? "");
  const direct = isAddress(who) ? getAddress(who) : null;
  const [found, setFound] = useState<{ address: Address; name: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const [msgs, setMsgs] = useState<Shown[] | null>(null);
  const [status, setStatus] = useState<Thread["status"]>("ok");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [menu, setMenu] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // Who is this? Account → read their @name; @name → look up their account.
  useEffect(() => {
    const h = who.replace(/^@/, "").toLowerCase();
    if (direct) nameOf(direct).then((name) => setFound({ address: direct, name }), () => {});
    else resolveName(h).then((a) => (a ? setFound({ address: a, name: h }) : setMissing(true)), () => setMissing(true));
  }, [who, direct]);
  const them = found ?? (direct ? { address: direct, name: "" } : null);

  const addr = them?.address;
  useEffect(() => {
    if (!canRead || !addr) return;
    let live = true;
    const load = () =>
      listMessages(addr).then((m) => {
        if (!live) return;
        setMsgs((prev) => [...m, ...(prev ?? []).filter((x) => x.pending || x.failed)]);
        if (m.some((x) => x.to === me && !x.read)) void markThreadRead(addr);
      }, (e) => live && setErr(humanError(e)));
    void load();
    listThreads().then((ts) => live && setStatus(ts.find((t) => t.with.address === addr)?.status ?? "ok"), () => {});
    const off = onLive((event, data) => {
      const m = data as ChatMessage;
      if (event === "message" && (m.from === addr || m.to === addr)) void load();
    });
    // Fallback while the realtime connection is down: check every 4s.
    const t = setInterval(() => !isLive() && document.visibilityState === "visible" && load(), 4000);
    return () => {
      live = false;
      off();
      clearInterval(t);
    };
  }, [canRead, addr, me]);

  const count = msgs?.length ?? 0;
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [count]);

  async function send(body = text.trim(), retryId?: string) {
    if (!addr || !me || !body) return;
    setErr("");
    setText("");
    const tmp = draft(me, addr, body, retryId);
    setMsgs((m) => [...(m ?? []).filter((x) => x.id !== tmp.id), tmp]);
    try {
      const real = await sendMessage(addr, body);
      setMsgs((m) => (m ?? []).filter((x) => x.id !== tmp.id && x.id !== real.id).concat(real).sort((a, b) => a.at - b.at));
      if (status === "request") setStatus("ok"); // replying accepts them
    } catch (e) {
      setMsgs((m) => (m ?? []).map((x) => (x.id === tmp.id ? { ...x, pending: false, failed: true } : x)));
      const s = String(e);
      setErr(s.includes("403") ? "You can't message each other right now." : s.includes("429") ? "Slow down a little. Try again in a minute." : "Message didn't send. Tap it to try again.");
    }
  }

  async function act(action: "block" | "unblock" | "accept") {
    if (!addr) return;
    setMenu(false);
    setErr("");
    const prev = status;
    setStatus(action === "block" ? "blocked" : "ok");
    try {
      await setThread(action, addr);
    } catch (e) {
      setStatus(prev);
      setErr(humanError(e));
    }
  }

  const mark = (id: string, s: "paid" | "declined" | "open") =>
    setMsgs((m) => (m ?? []).map((x) => (x.kind === "request" && x.ref === id && x.req ? { ...x, req: { ...x.req, status: s } } : x)));

  async function pay(m: ChatMessage) {
    if (!m.req) return;
    setErr("");
    setPaying(m.ref);
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 2000);
    try {
      const units = BigInt(m.req.amount);
      const hash = await sendDollars(m.from, units);
      mark(m.ref, "paid");
      void settleRequest(m.ref, "paid", hash).catch(() => {});
      void recordPayment(m.from, units);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      clearTimeout(t);
      setPaying(null);
    }
  }

  async function decline(m: ChatMessage) {
    setErr("");
    mark(m.ref, "declined");
    try {
      await settleRequest(m.ref, "declined");
    } catch (e) {
      mark(m.ref, "open");
      setErr(humanError(e));
    }
  }

  const name = them?.name ? `@${them.name}` : "them";
  const blocked = status === "blocked";

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex min-h-16 items-center gap-2 border-b border-line px-3 pt-[env(safe-area-inset-top)]">
        <Link href="/messages" aria-label="Back" className="grid size-11 place-items-center rounded-full text-2xl active:bg-surface-2">‹</Link>
        <Avatar name={them?.name} size={36} />
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{them?.name ? `@${them.name}` : ""}</h1>
        {them?.name && (
          <Link href={`/send?to=${encodeURIComponent(them.name)}`} className="grid h-11 place-items-center rounded-full bg-brand-soft px-4 text-sm font-semibold text-brand active:scale-95">
            Send money
          </Link>
        )}
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu} className="grid size-11 place-items-center rounded-full active:bg-surface-2">
            <Ico name="more" size={22} />
          </button>
          {menu && (
            <div className="absolute right-0 top-12 z-10 w-48 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
              <button onClick={() => act(blocked ? "unblock" : "block")} className="flex min-h-12 w-full items-center gap-3 px-4 text-left font-semibold text-bad active:bg-surface-2">
                <Ico name="block" /> {blocked ? `Unblock ${name}` : `Block ${name}`}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {missing && <p className="m-auto text-center text-muted">No one on Kin with that name yet.</p>}
        {!canRead && (
          <Card className="m-auto flex flex-col items-center gap-3 text-center">
            <p className="font-semibold">Your messages are private</p>
            <Button onClick={() => unlock().catch((e) => setErr(humanError(e)))}>Confirm with Identity check</Button>
          </Card>
        )}
        {canRead && !msgs && !missing && <div className="m-auto size-6 animate-spin rounded-full border-2 border-muted border-t-transparent" aria-label="Loading" />}
        {msgs && !msgs.length && (
          <p className="m-auto max-w-60 text-center text-sm text-muted">Say hi to {name}. Requests and payments between you show up here too.</p>
        )}
        {msgs?.map((m) => {
          const mine = m.from === me;
          if (m.kind === "payment")
            return (
              <div key={m.id} className="my-1 flex justify-center">
                <Chip tone="good">{mine ? "You paid" : `${name} paid you`} {formatMoney(BigInt(m.ref || "0"))} ✓✓</Chip>
              </div>
            );
          if (m.kind === "request" && m.req) {
            const r = m.req;
            return (
              <div key={m.id} className="my-1">
                <Bubble mine={mine} amount={formatMoney(BigInt(r.amount))} note={r.note}>
                  <p className={`mt-1 text-xs text-muted ${mine ? "text-right" : ""}`}>{mine ? "You asked" : `${name} asked you`} · {time(m.at)}</p>
                  {!mine && r.status === "open" && (
                    <div className="mt-2 flex w-full max-w-80 gap-2">
                      <Button variant="ghost" className="h-12! flex-1" onClick={() => decline(m)} disabled={!!paying}>Decline</Button>
                      <Button className="h-12! flex-[2]" onClick={() => pay(m)} busy={paying === m.ref} disabled={!!paying && paying !== m.ref}>
                        Pay {formatMoney(BigInt(r.amount))}
                      </Button>
                    </div>
                  )}
                  {paying === m.ref && <p className="mt-1 text-sm text-muted">{slow ? `Delivering to ${name}…` : "Sending…"}</p>}
                  {r.status !== "open" && (
                    <span className="mt-1"><Chip tone={r.status === "paid" ? "good" : "muted"}>{r.status === "paid" ? "Paid ✓✓" : "Declined"}</Chip></span>
                  )}
                </Bubble>
              </div>
            );
          }
          if (m.kind === "request") return null; // request vanished
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <button
                disabled={!m.failed}
                onClick={() => send(m.body, m.id)}
                className={`max-w-[80%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-left text-base ${
                  mine ? "rounded-br-md bg-brand text-brand-ink" : "rounded-bl-md border border-line bg-surface"
                } ${m.pending ? "opacity-60" : ""} ${m.failed ? "ring-2 ring-bad" : ""}`}
              >
                {m.body}
              </button>
              <span className="px-2 text-[11px] text-muted">{m.failed ? "Not sent · tap to retry" : m.pending ? "Sending…" : time(m.at)}</span>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {err && <div className="px-4 pb-2"><ErrorText>{err}</ErrorText></div>}

      {status === "request" && (
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
          <p className="text-center text-sm text-muted">{name} isn&apos;t in your people yet.</p>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => act("block")}>Block</Button>
            <Button className="flex-1" onClick={() => act("accept")}>Accept</Button>
          </div>
        </div>
      )}

      {blocked ? (
        <p className="border-t border-line px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-muted">
          You blocked {name}. Unblock to chat.
        </p>
      ) : (
        <form
          onSubmit={(e) => (e.preventDefault(), send())}
          className="flex items-end gap-2 border-t border-line px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <label className="flex-1">
            <span className="sr-only">Message</span>
            <textarea
              rows={1}
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder={`Message ${name}`}
              disabled={!canRead || !addr}
              className="max-h-32 min-h-12 w-full resize-none rounded-3xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none placeholder:text-muted focus:border-brand"
            />
          </label>
          <button
            type="submit"
            disabled={!text.trim() || !canRead || !addr}
            aria-label="Send"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition active:scale-95 disabled:opacity-40"
          >
            <Ico name="post" size={22} />
          </button>
        </form>
      )}
    </main>
  );
}
