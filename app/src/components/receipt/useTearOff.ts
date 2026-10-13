"use client";
// Pull-to-tear for the printed ticket (ReceiptTicket). One Pointer Events path for mouse, touch and pen. Per-frame writes go
// straight to the paper's style (translate / rotate / transform-origin only), never React state.
// Markup it expects inside `root`: .kt-slot, .kt-feed > .kt-paper (+ .kt-perf, .kt-stub), and `main` around it.
import { useEffect, useEffectEvent, type RefObject } from "react";

export const READY_MS = 1370; // the feed lands (kt-feed: 120 ms delay + 1250 ms); drags start after this
const SLOP = 6; // px before a press becomes a pull (so taps and text selection keep working)
const FLICK = 1.1; // px/ms downward at release = tear even below the line
const MAX_ROT = 4; // deg
const STUB = 6; // px of paper left in the slot
const TEETH = 22;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function useTearOff(root: RefObject<HTMLElement | null>, onTear: () => void, onPull: () => void) {
  const torn = useEffectEvent(onTear);
  const pulled = useEffectEvent(onPull);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = (s: string) => el.querySelector<HTMLElement>(s)!;
    const paper = q(".kt-paper"), feed = q(".kt-feed"), perf = q(".kt-perf"), stub = q(".kt-stub"), slot = q(".kt-slot");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const ready = () => reduced || performance.now() - t0 > READY_MS;

    // No pull-to-refresh / bounce while on this screen.
    const html = document.documentElement, body = document.body;
    const prev = [html.style.overscrollBehaviorY, body.style.overscrollBehaviorY];
    html.style.overscrollBehaviorY = body.style.overscrollBehaviorY = "contain";
    // Own layer only while it moves (feed + sway now; drags later); dropped at rest.
    if (!reduced) paper.style.willChange = "translate, rotate";

    type Grab = { id: number; x0: number; y0: number; x: number; y: number; t: number; vx: number; vy: number; limit: number; on: boolean; armed: boolean };
    let g: Grab | null = null;
    let pose = { x: 0, y: 0, r: 0 };
    let raf = 0;
    let done = false;

    const put = (x: number, y: number, r: number) => {
      pose = { x, y, r };
      paper.style.translate = `${x}px ${y}px`;
      paper.style.rotate = `${r}deg`;
      paper.style.transformOrigin = `50% ${-y}px`; // pivot at the slot mouth: the top stays held
    };

    const frame = () => {
      raf = 0;
      if (!g) return;
      const dx = g.x - g.x0, dy = g.y - g.y0, p = Math.max(0, dy / g.limit);
      // Down: light give that grows toward the line. Up past rest: strong rubber band, 24 px at most.
      const y = dy >= 0 ? dy * (1 - 0.12 * Math.min(p, 1.5)) : -24 * (1 - 1 / (1 - dy / 60));
      const r = clamp(-dx * 0.035, -MAX_ROT, MAX_ROT) * clamp(y / 40, 0, 1);
      const shake = p > 0.85 ? Math.round((Math.random() * 2 - 1) * Math.min(1.5, (p - 0.85) * 10)) : 0;
      put(shake, Math.round(y), r);
      perf.style.opacity = String(clamp((p - 0.1) / 0.9, 0, 1));
      if (p >= 1 && !g.armed) navigator.vibrate?.(10);
      g.armed = p >= 1;
    };

    const fade = (els: HTMLElement[], ms: number) =>
      Promise.all(els.map((e) => e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, fill: "forwards", easing: "ease-out" }).finished));

    const back = () => {
      perf.style.opacity = "0";
      const { x, y, r } = pose;
      paper.style.translate = paper.style.rotate = paper.style.transformOrigin = "";
      pose = { x: 0, y: 0, r: 0 };
      if (reduced) return void (paper.style.willChange = "");
      const o = Math.min(8, Math.round(y * 0.04)); // overshoot once, into the slot
      const a = paper.animate([
        { translate: `${x}px ${y}px`, rotate: `${r}deg`, transformOrigin: `50% ${-y}px`, easing: "cubic-bezier(0.3, 0.8, 0.4, 1)" },
        { translate: `0px ${-o}px`, rotate: `${-r * 0.3}deg`, transformOrigin: `50% ${o}px`, offset: 0.6, easing: "ease-in-out" },
        { translate: "0px 0px", rotate: "0deg", transformOrigin: "50% 0px" },
      ], { duration: 280 + Math.min(220, y * 0.5) });
      a.onfinish = () => { paper.style.animation = "kt-sway 800ms ease-in-out"; }; // the landing sway, once more
    };

    const tear = (vx: number, vy: number) => {
      done = true;
      pulled();
      navigator.vibrate?.(20);
      paper.style.animation = "none";
      perf.style.opacity = "0";
      const main = el.closest("main");
      const rest = [...(main?.querySelectorAll<HTMLElement>(":scope > header, :scope > div > :not(.kt-printer)") ?? []), slot, stub];
      if (reduced) return void fade([...rest, paper], 150).then(torn);

      const { x, y, r } = pose;
      // Jagged line just under the mouth: the stub keeps the top half of the teeth, the falling piece the rest.
      const teeth = Array.from({ length: TEETH + 1 }, (_, i) => (i % 2 ? 3 : 0) + Math.round(Math.random() * 2));
      const edge = (top: number) => teeth.map((d, i) => `${(i / TEETH) * 100}% ${top + d}px`);
      stub.style.clipPath = `polygon(0 0, 100% 0, ${edge(STUB).reverse().join(",")})`;
      stub.style.opacity = "1";
      const T0 = STUB - y; // tear line in paper coordinates
      paper.style.clipPath = `polygon(-60px ${T0}px, ${edge(T0).join(",")}, calc(100% + 60px) ${T0}px, calc(100% + 60px) calc(100% + 60px), -60px calc(100% + 60px))`;
      feed.style.clipPath = "none";

      // Gravity fall, 380–600 ms, spin from release speed. Pivot moves to the middle; translate absorbs the jump.
      const h = paper.offsetHeight, rad = (r * Math.PI) / 180, d = -(y + h / 2);
      const cx = x + d * Math.sin(rad), cy = y + d * (1 - Math.cos(rad));
      const v0 = Math.max(0.5, vy), D = innerHeight - (feed.getBoundingClientRect().top + y) + 40;
      const T = clamp((-v0 + Math.sqrt(v0 * v0 + 2 * 0.004 * D)) / 0.004, 380, 600);
      const G = Math.max(0.0008, (2 * (D - v0 * T)) / (T * T));
      const s = clamp(clamp(vx, -1, 1) * 50 - r * 4, -40, 40);
      const spin = Math.sign(s || 1) * Math.max(10, Math.abs(s));
      const drift = clamp(vx, -1, 1) * 0.5;
      const fall = paper.animate(Array.from({ length: 13 }, (_, k) => {
        const t = (k / 12) * T;
        return { translate: `${cx + drift * t}px ${cy + v0 * t + (G * t * t) / 2}px`, rotate: `${r + spin * (t / T)}deg`, transformOrigin: "50% 50%" };
      }), { duration: T, fill: "forwards" });
      feed.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T * 0.9, fill: "forwards", pseudoElement: "::before" }); // slot shade
      Promise.all([fall.finished, fade(rest, T * 0.9)]).then(torn);
    };

    const down = (e: PointerEvent) => {
      if (done || g || !e.isPrimary || e.button > 0 || !ready()) return;
      if ((e.target as Element).closest("button, a, input, textarea, select, label")) return;
      const vh = innerHeight;
      // Tear line: the pointer near the bottom (88% of the screen) or 45% of the screen pulled, whichever comes
      // first; at least 12% so a grab near the bottom still needs a real pull.
      const limit = clamp(0.88 * vh - e.clientY, 0.12 * vh, 0.45 * vh);
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: e.timeStamp, vx: 0, vy: 0, limit, on: false, armed: false };
    };

    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dt = e.timeStamp - g.t;
      if (dt > 0) {
        g.vx = 0.3 * g.vx + (0.7 * (e.clientX - g.x)) / dt;
        g.vy = 0.3 * g.vy + (0.7 * (e.clientY - g.y)) / dt;
      }
      g.x = e.clientX; g.y = e.clientY; g.t = e.timeStamp;
      if (!g.on) {
        const dx = g.x - g.x0, dy = g.y - g.y0;
        if (Math.hypot(dx, dy) < SLOP) return;
        // Down-first only (and only at the top of the page on touch): up = page scroll, sideways = text selection.
        if (dy <= Math.abs(dx) || (e.pointerType !== "mouse" && scrollY > 0)) return void (g = null);
        g.on = true;
        paper.setPointerCapture(e.pointerId);
        getSelection()?.removeAllRanges();
        paper.style.userSelect = "none";
        for (const a of paper.getAnimations()) a.cancel(); // a spring still settling
        paper.style.animation = "none"; // stops the sway (≤0.9°, so the hand-off doesn't show)
        paper.style.willChange = "translate, rotate";
        pulled();
      }
      raf ||= requestAnimationFrame(frame);
    };

    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const was = g;
      g = null;
      cancelAnimationFrame(raf);
      raf = 0;
      if (!was.on) return;
      paper.style.userSelect = "";
      const vy = e.timeStamp - was.t > 80 ? 0 : was.vy; // held still before letting go = no flick
      if (e.type === "pointerup" && (was.armed || (vy > FLICK && was.y - was.y0 > 60))) tear(was.vx, vy);
      else back();
    };

    // Touch: a downward start at the top of the page is ours (no scroll, no refresh). Safari ignores `pan-down`,
    // so this is what holds the page still there; Chrome already leaves downward pulls to us via touch-action.
    const touch = (e: TouchEvent) => {
      if (!g || !e.cancelable) return;
      const t = e.touches[0], dy = t.clientY - g.y0;
      if (g.on || (scrollY <= 0 && dy > 0 && dy >= Math.abs(t.clientX - g.x0))) e.preventDefault();
    };
    // Scrolled down: pulling down scrolls back up instead of grabbing.
    const scroll = () => { paper.style.touchAction = scrollY > 0 ? "pan-y" : ""; };
    const key = (e: KeyboardEvent) => {
      if (done || e.target !== paper || !["Enter", " ", "Delete"].includes(e.key)) return;
      e.preventDefault();
      tear(0, 0.6);
    };
    const swayEnd = (e: AnimationEvent) => { if (e.target === paper && e.animationName === "kt-sway" && !g) paper.style.willChange = ""; };
    const noDrag = (e: DragEvent) => e.preventDefault(); // native text/image drag would cancel the pull

    paper.addEventListener("pointerdown", down);
    paper.addEventListener("pointermove", move);
    paper.addEventListener("pointerup", up);
    paper.addEventListener("pointercancel", up);
    paper.addEventListener("touchmove", touch, { passive: false });
    paper.addEventListener("keydown", key);
    paper.addEventListener("animationend", swayEnd);
    paper.addEventListener("dragstart", noDrag);
    addEventListener("scroll", scroll, { passive: true });
    scroll();
    return () => {
      cancelAnimationFrame(raf);
      paper.removeEventListener("pointerdown", down);
      paper.removeEventListener("pointermove", move);
      paper.removeEventListener("pointerup", up);
      paper.removeEventListener("pointercancel", up);
      paper.removeEventListener("touchmove", touch);
      paper.removeEventListener("keydown", key);
      paper.removeEventListener("animationend", swayEnd);
      paper.removeEventListener("dragstart", noDrag);
      removeEventListener("scroll", scroll);
      [html.style.overscrollBehaviorY, body.style.overscrollBehaviorY] = prev;
    };
  }, [root]);
}
