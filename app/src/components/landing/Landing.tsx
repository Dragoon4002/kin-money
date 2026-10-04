import { KinMark } from "@/components/KinMark";
import { Kinko } from "@/components/kinko/Kinko";
import { Amount, Button, Chip, ErrorText, Ico, IconTile } from "@/components/ui";
import type { IconName } from "@/lib/icons";

const STEPS: [IconName, string, string][] = [
  ["safe", "Make your account with an Identity check", "No passwords, no forms. Ready in seconds."],
  ["qr", "Send by @name or QR", "Pick someone you love. They get it in a second."],
  ["sparkle", "Money that behaves", "Allowances that grow, pots that pay, jars that save."],
];

const FEATURES: [IconName, string, string][] = [
  ["allowance", "Live allowance", "Grows every second for your kid abroad."],
  ["circle", "Savings circles", "Save together, take turns getting paid."],
  ["pot", "Family pot", "Siblings chip in for mum and dad."],
  ["jars", "Savings jars", "Put a little aside for big dreams."],
  ["chores", "Chores", "Kids finish a task, get paid on your OK."],
  ["bill", "Pay a bill", "Rent, school, hospital. Paid straight there."],
  ["invoice", "Invoices", "Get paid by clients anywhere."],
  ["gift", "Gifts", "Money that opens on the big day."],
];

const WHO: [IconName, string, string][] = [
  ["family", "Working abroad", "Send home every month without losing a cut."],
  ["education", "Parents of students", "Cover books, rent and emergencies overseas."],
  ["together", "Communities", "Run your savings circle with no one holding the cash."],
];

const FAQ: [string, string][] = [
  ["Is it really free?", "Yes. Sending money to family costs nothing."],
  ["Is my money safe?", "Only you can move it. Every payment needs an Identity check."],
  ["What if I lose my phone?", "Your account is saved in your phone's password manager. Sign in on your new phone with an Identity check."],
  ["Who can I send to?", "Anyone, anywhere. If they're not on Kin yet, send them a link."],
];

const wrap = "mx-auto w-full max-w-5xl px-5 md:px-8";
const h2 = "font-display text-4xl leading-[1.05] tracking-tight md:text-5xl";

/** Signed-out marketing page. Breaks out of the app's phone-width column to use desktop space. */
export function Landing({ onStart, onUnlock, busy, err }: { onStart: () => void; onUnlock: () => void; busy: boolean; err: string }) {
  const unlock = (
    <button onClick={onUnlock} disabled={busy} className="h-12 px-2 text-sm font-semibold text-muted active:text-ink disabled:opacity-40">
      I already have Kin
    </button>
  );

  return (
    // ponytail: 100vw breakout; adds ~15px horizontal overflow on desktops with classic scrollbars unless body has overflow-x: clip.
    <main className="relative ml-[calc(50%-50vw)] w-screen bg-bg pb-[max(2rem,env(safe-area-inset-bottom))] text-ink">
      <header className={`${wrap} flex h-16 items-center justify-between pt-[env(safe-area-inset-top)]`}>
        <span className="flex items-center gap-2 font-display text-4xl leading-none text-brand"><KinMark />kin</span>
        {unlock}
      </header>

      {/* Hero */}
      <section className={`${wrap} grid items-center gap-10 pb-16 pt-6 md:grid-cols-2 md:pb-24 md:pt-16`}>
        <div className="flex flex-col gap-5">
          <h1 className="font-display text-[3.4rem] leading-[1.02] tracking-tight md:text-7xl">
            Money for the people you <span className="text-brand">love</span>, anywhere.
          </h1>
          <p className="max-w-md text-lg text-muted">Send dollars home in a second. Free, with just an Identity check. Then set it to save, share and grow on its own.</p>
          <ErrorText>{err}</ErrorText>
          <div className="flex flex-col gap-2 md:max-w-xs">
            <Button onClick={onStart}>Get started</Button>
            <p className="text-center text-sm text-muted">No passwords. No fees.</p>
          </div>
        </div>
        <div className="relative mx-auto grid w-full max-w-sm place-items-center py-6">
          <div aria-hidden className="absolute inset-10 rounded-full bg-brand/20 blur-3xl" />
          <div className="relative"><Kinko size={180} mood="happy" /></div>
          <div className="relative -mt-4 w-64 rounded-[28px] border border-line bg-surface p-4 shadow-xl shadow-ink/5">
            <p className="text-sm text-muted">Sent to @mama</p>
            <Amount value="$50.00" size="md" />
            <div className="mt-2"><Chip tone="good">Delivered ✓✓</Chip></div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className={`${wrap} py-14 md:py-20`}>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">How it works</p>
        <h2 className={`${h2} mt-2`}>Three steps. That&apos;s it.</h2>
        <ol className="mt-8 grid gap-3 md:grid-cols-3">
          {STEPS.map(([icon, title, sub], i) => (
            <li key={title} className="flex gap-4 rounded-[28px] border border-line bg-surface p-5 md:flex-col">
              <IconTile name={icon} tone={i === 0 ? "brand" : "neutral"} />
              <div>
                <p className="text-sm text-muted">Step {i + 1}</p>
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted">{sub}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className={`${wrap} py-14 md:py-20`}>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">More than sending</p>
        <h2 className={`${h2} mt-2`}>Money that does the work for you.</h2>
        <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {FEATURES.map(([icon, title, sub]) => (
            <li key={title} className="flex flex-col gap-3 rounded-[28px] border border-line bg-surface p-4">
              <IconTile name={icon} size={44} />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="mt-0.5 text-sm text-muted">{sub}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Who it's for */}
      <section className="bg-surface-2 py-14 md:py-20">
        <div className={wrap}>
          <h2 className={h2}>Built for families across borders.</h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {WHO.map(([icon, title, sub]) => (
              <li key={title} className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-ink"><Ico name={icon} size={22} /></span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted">{sub}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Trust */}
      <section className={`${wrap} py-14 text-center md:py-20`}>
        <p className="mx-auto max-w-2xl font-display text-3xl leading-tight md:text-4xl">
          Your money is yours. No passwords, no fees, delivered in a second.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Chip><span className="inline-flex items-center gap-1.5"><Ico name="safe" size={14} />Identity check only</span></Chip>
          <Chip><span className="inline-flex items-center gap-1.5"><Ico name="dollar" size={14} />Free to send</span></Chip>
          <Chip><span className="inline-flex items-center gap-1.5"><Ico name="check" size={14} />Delivered ✓✓</span></Chip>
        </div>
      </section>

      {/* FAQ */}
      <section className={`${wrap} py-14 md:py-20`}>
        <h2 className={h2}>Questions</h2>
        <div className="mt-6 divide-y divide-line border-y border-line md:max-w-2xl">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <Ico name="chevron" className="shrink-0 text-muted transition group-open:rotate-90" />
              </summary>
              <p className="pb-4 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className={`${wrap} pt-6`}>
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-line bg-surface px-5 py-10 text-center">
          <Kinko size={88} mood="celebrate" />
          <h2 className={h2}>Your family, one tap away.</h2>
          <div className="flex w-full max-w-xs flex-col gap-1">
            <Button onClick={onStart}>Create my account</Button>
            {unlock}
          </div>
        </div>
        <p className="mt-8 text-center text-sm text-muted">Kin · Money for the people you love</p>
      </section>
    </main>
  );
}
