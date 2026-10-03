"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Band, Button, Card, ErrorText, Ico, IconTile, Row, Screen } from "@/components/ui";
import { importAccount, removeImported, revealSecrets, useRequireAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { parseSecret } from "@/lib/keys";
import { nameOf, shortAddr } from "@/lib/names";

// Me → Security. Only screen allowed to say "recovery phrase", "private key", "wallet" (docs/PRODUCT.md exception).
// Secrets exist only in this component's state after a fresh Face ID; leaving, backgrounding or "Done" drops them.

type Secrets = { mnemonic: string; privateKeyHex: string };
type Step = "menu" | "warn" | "show" | "add";

export default function Security() {
  const { profile, accounts } = useRequireAccount();
  const [step, setStep] = useState<Step>("menu");
  const [secrets, setSecrets] = useState<Secrets | null>(null);

  // Auto-hide when the tab/app goes to the background.
  useEffect(() => {
    const hide = () => document.hidden && (setSecrets(null), setStep((s) => (s === "show" ? "menu" : s)));
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  const back = () => (setSecrets(null), setStep("menu"));
  const others = accounts.filter((a) => !a.kin);

  if (step === "warn") return <Warn onBack={back} onShown={(s) => (setSecrets(s), setStep("show"))} />;
  if (step === "show" && secrets) return <Show secrets={secrets} onDone={back} />;
  if (step === "add") return <Add kinAddress={accounts.find((a) => a.kin)?.address} onDone={back} />;

  return (
    <Screen wide title="Security" back="/me">
      <Band>Use Kin in another wallet</Band>
      <Row onClick={() => setStep("warn")} icon={<IconTile name="safe" size={44} />} title="Show my recovery phrase"
        sub="Back up, or open this account in MetaMask, Rabby…" trail={<Chev />} />
      <Band>Bring an account to Kin</Band>
      <Row onClick={() => setStep("add")} icon={<IconTile name="add" size={44} />} title="Add an account from another wallet"
        sub="Paste its recovery phrase or private key" trail={<Chev />} />
      {others.length > 0 && (
        <>
          <Band>Other accounts on this phone</Band>
          {others.map((a) => (
            <RemoveRow key={a.address} label={a.name ? `@${a.name}` : shortAddr(a.address)} active={a.address === profile?.address}
              onRemove={() => removeImported(a.address)} />
          ))}
          <p className="px-5 text-xs text-muted">Removing only forgets it on this phone. Its money stays with its recovery phrase.</p>
        </>
      )}
    </Screen>
  );
}

function RemoveRow({ label, active, onRemove }: { label: string; active: boolean; onRemove: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <div className="flex min-h-16 items-center gap-3 px-5">
      <span className="flex-1 font-semibold">{label}{active && <span className="ml-2 text-sm font-normal text-muted">In use</span>}</span>
      {sure ? (
        <span className="flex gap-1">
          <button onClick={() => setSure(false)} className="h-11 rounded-full px-4 text-sm font-semibold text-muted">Keep</button>
          <button onClick={onRemove} className="h-11 rounded-full bg-bad/15 px-4 text-sm font-semibold text-bad">Remove</button>
        </span>
      ) : (
        <button onClick={() => setSure(true)} aria-label={`Remove ${label}`} className="grid size-11 place-items-center rounded-full text-bad active:bg-surface-2">
          <Ico name="remove" />
        </button>
      )}
    </div>
  );
}

function Warn({ onBack, onShown }: { onBack: () => void; onShown: (s: Secrets) => void }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function reveal() {
    setBusy(true);
    setErr("");
    try {
      onShown(await revealSecrets());
    } catch (e) {
      setErr(humanError(e));
      setBusy(false);
    }
  }
  return (
    <Screen title="Your recovery phrase" action={<BackBtn onClick={onBack} />}>
      <Card className="flex flex-col gap-3 text-sm">
        <p className="font-semibold">Before you look</p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-muted">
          <li>Anyone with these words controls your money. Keep them offline and private.</li>
          <li>Don’t take a screenshot or paste them into chats.</li>
          <li>Kin will never ask for them. Anyone who does is a scam.</li>
        </ul>
      </Card>
      <label className="flex min-h-11 items-center gap-3 px-1">
        <input type="checkbox" className="size-6 accent-brand" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span className="font-semibold">I understand</span>
      </label>
      <ErrorText>{err}</ErrorText>
      <div className="mt-auto">
        <Button disabled={!ok} busy={busy} onClick={reveal}>Show with Identity check</Button>
      </div>
    </Screen>
  );
}

function Show({ secrets, onDone }: { secrets: Secrets; onDone: () => void }) {
  const words = secrets.mnemonic.split(" ");
  return (
    <Screen title="Your recovery phrase" action={<BackBtn onClick={onDone} />}>
      <p className="text-sm text-muted">Works in MetaMask, Rabby and other wallets: import with this phrase (first account).</p>
      <Hold label="Hold to show your 24 words">
        <ol className="grid grid-cols-2 gap-x-4 gap-y-2 text-base">
          {words.map((w, i) => (
            <li key={i} className="flex gap-2"><span className="w-6 text-right text-muted">{i + 1}</span><span className="font-semibold">{w}</span></li>
          ))}
        </ol>
      </Hold>
      <CopyBtn text={secrets.mnemonic} label="Copy recovery phrase" />
      <Band>Private key</Band>
      <Hold label="Hold to show private key">
        <p className="break-all font-mono text-sm">{secrets.privateKeyHex}</p>
      </Hold>
      <CopyBtn text={secrets.privateKeyHex} label="Copy private key" />
      <div className="mt-auto">
        <Button onClick={onDone}>Done, hide it</Button>
      </div>
    </Screen>
  );
}

/** Blurred until pressed and held. */
function Hold({ label, children }: { label: string; children: ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <div onPointerDown={() => setOn(true)} onPointerUp={() => setOn(false)} onPointerLeave={() => setOn(false)} onPointerCancel={() => setOn(false)}
      onContextMenu={(e) => e.preventDefault()} role="button" aria-label={label} aria-pressed={on}
      className="relative touch-none select-none rounded-2xl border border-line bg-surface p-4">
      <div className={on ? "" : "blur-md"} aria-hidden={!on}>{children}</div>
      {!on && <span className="absolute inset-0 grid place-items-center text-sm font-semibold">{label}</span>}
    </div>
  );
}

/** Copies, then wipes the clipboard after 60s (if the browser lets us). */
function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => (navigator.clipboard.writeText("").catch(() => {}), setCopied(false)), 60_000);
  }
  return (
    <Button variant="soft" onClick={copy}>{copied ? "Copied. Clears in 1 minute" : label}</Button>
  );
}

function Add({ kinAddress, onDone }: { kinAddress?: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [found, setFound] = useState<{ address: string; name: string } | null>(null);
  // Preview only: key bytes zeroed straight away; parsed again on submit.
  const address = useMemo(() => {
    const p = parseSecret(text);
    p?.privateKey.fill(0);
    return p?.address ?? null;
  }, [text]);
  const mine = !!address && address === kinAddress;

  useEffect(() => {
    if (!address) return;
    let live = true;
    nameOf(address).then((name) => live && setFound({ address, name }), () => {});
    return () => void (live = false);
  }, [address]);
  const name = found?.address === address ? found.name : "";

  async function add() {
    const p = parseSecret(text);
    if (!p) return;
    setBusy(true);
    setErr("");
    try {
      await importAccount(p.privateKey, name || undefined);
      setText("");
      onDone();
    } catch (e) {
      p.privateKey.fill(0);
      setErr(humanError(e));
      setBusy(false);
    }
  }

  return (
    <Screen title="Add an account" action={<BackBtn onClick={onDone} />}>
      <p className="text-sm text-muted">Paste the 12 or 24-word recovery phrase, or the private key, from your other wallet. It stays locked on this phone behind your Identity check.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="Recovery phrase or private key"
        autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} placeholder="word word word…"
        className="w-full rounded-2xl border border-line bg-surface p-4 text-base text-ink outline-none placeholder:text-muted focus:border-brand" />
      {address ? (
        <Card className="text-sm">
          {mine ? "That’s already your Kin account." : <>Account <span className="font-semibold">{name ? `@${name}` : shortAddr(address)}</span> found</>}
        </Card>
      ) : text.trim() ? (
        <p className="text-sm text-muted">Check the words: 12 or 24, spelled exactly, one space apart.</p>
      ) : null}
      <ErrorText>{err}</ErrorText>
      <div className="mt-auto">
        <Button disabled={!address || mine} busy={busy} onClick={add}>Add with Identity check</Button>
      </div>
    </Screen>
  );
}

const BackBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} aria-label="Back" className="grid size-11 place-items-center rounded-full text-sm font-semibold text-muted active:bg-surface-2">
    <Ico name="close" />
  </button>
);
const Chev = () => <Ico name="chevron" className="text-muted" />;
