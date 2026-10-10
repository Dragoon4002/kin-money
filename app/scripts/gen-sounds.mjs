// Renders Kin's generated sound effects to tone-*.wav for the web (app/public/sounds) and mobile
// (mobile/assets/sounds). Which sound plays where is decided by the sound routers, not here:
// app/src/lib/sound.ts and mobile/src/lib/sound.ts. Run: node app/scripts/gen-sounds.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 22050;
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = [join(root, "app/public/sounds"), join(root, "mobile/assets/sounds")];

// Note frequencies (Hz).
const N = { F3: 174.61, A3: 220, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.51, G6: 1567.98, A6: 1760, B5: 987.77 };
const BELL = [[1, 1], [2, 0.3], [3, 0.12]]; // soft bell
const SQUAREISH = [[1, 1], [3, 0.25], [5, 0.08]]; // odd partials, game-coin feel
const MELLOW = [[1, 1], [2, 0.15]];

let seed = 7; // deterministic noise, so re-running gives the same files
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function sound(seconds) {
  const buf = new Float32Array(Math.ceil(seconds * SR));
  const api = {
    /** Struck note: 4ms attack, exponential decay over `dur`. */
    note(at, freq, dur, amp, partials = BELL) {
      const s0 = Math.floor(at * SR);
      for (let i = 0; i < dur * SR && s0 + i < buf.length; i++) {
        const t = i / SR;
        const env = Math.min(1, t / 0.004) * Math.exp((-5 * t) / dur);
        let v = 0;
        for (const [m, a] of partials) v += a * Math.sin(2 * Math.PI * freq * m * t);
        buf[s0 + i] += amp * env * v;
      }
      return api;
    },
    /** Pitch-dropping sine thump (the "pop" of a lid). */
    thump(at, from, to, dur, amp) {
      const s0 = Math.floor(at * SR);
      let ph = 0;
      for (let i = 0; i < dur * SR && s0 + i < buf.length; i++) {
        const t = i / SR;
        ph += (2 * Math.PI * (from + (to - from) * (t / dur))) / SR;
        buf[s0 + i] += amp * Math.exp((-6 * t) / dur) * Math.sin(ph);
      }
      return api;
    },
    /** Low-passed noise with a sweeping cutoff (whoosh / rustle). */
    noise(at, dur, amp, fromHz, toHz) {
      const s0 = Math.floor(at * SR);
      let y = 0;
      for (let i = 0; i < dur * SR && s0 + i < buf.length; i++) {
        const t = i / dur / SR;
        const k = 1 - Math.exp((-2 * Math.PI * (fromHz + (toHz - fromHz) * t)) / SR);
        y += k * (rand() - y);
        buf[s0 + i] += amp * Math.sin(Math.PI * t) * y;
      }
      return api;
    },
    /** Random high bell pings between `from` and `to` seconds. */
    sparkle(from, to, count, amp) {
      for (let i = 0; i < count; i++) api.note(from + ((rand() + 1) / 2) * (to - from), 2000 + ((rand() + 1) / 2) * 2200, 0.25, amp);
      return api;
    },
    buf,
  };
  return api;
}

const TONES = {
  sent: [0.7, sound(0.8).note(0, N.E6, 0.25, 0.5).note(0.08, N.A6, 0.6, 0.5)],
  received: [0.7, sound(1.2).note(0, N.C5, 0.6, 0.4).note(0.09, N.E5, 0.6, 0.4).note(0.18, N.G5, 0.8, 0.45).note(0.27, N.C6, 0.9, 0.35)],
  coin: [0.6, sound(0.6).note(0, N.B5, 0.08, 0.4, SQUAREISH).note(0.07, N.E6, 0.45, 0.4, SQUAREISH)],
  success: [0.6, sound(0.8).note(0, N.G5, 0.35, 0.45).note(0.1, N.C6, 0.65, 0.45)],
  scan: [0.5, sound(0.12).note(0, N.A6, 0.08, 0.5)],
  cashout: [0.6, sound(1).noise(0, 0.45, 0.6, 300, 4000).note(0.36, N.G6, 0.55, 0.3)],
  error: [0.45, sound(0.6).note(0, N.A3, 0.2, 0.4, MELLOW).note(0.13, N.F3, 0.4, 0.4, MELLOW)],
  celebrate: [0.7, sound(1.6)
    .note(0, N.C5, 0.5, 0.35).note(0.07, N.E5, 0.5, 0.35).note(0.14, N.G5, 0.5, 0.35).note(0.21, N.C6, 0.6, 0.35)
    .note(0.3, N.C6, 1.1, 0.2).note(0.3, N.E6, 1.1, 0.2).note(0.3, N.G6, 1.1, 0.2)
    .sparkle(0.35, 1.2, 10, 0.08)],
  gift: [0.7, sound(1.5)
    .noise(0, 0.06, 0.8, 1500, 3000).thump(0, 180, 60, 0.14, 0.7)
    .note(0.1, N.G5, 0.5, 0.3).note(0.16, N.C6, 0.5, 0.3).note(0.22, N.E6, 0.6, 0.3).note(0.28, N.G6, 0.9, 0.3)
    .sparkle(0.3, 1.1, 12, 0.08)],
};

function wav(samples, peak) {
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  const fade = Math.floor(0.01 * SR);
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write("RIFF", 0); out.writeUInt32LE(36 + samples.length * 2, 4); out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); // PCM, mono
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write("data", 36); out.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => {
    const tail = Math.min(1, (samples.length - i) / fade);
    out.writeInt16LE(Math.round((v / max) * peak * tail * 32767), 44 + i * 2);
  });
  return out;
}

for (const dir of OUT) {
  mkdirSync(dir, { recursive: true });
  for (const [name, [peak, s]] of Object.entries(TONES)) writeFileSync(join(dir, `tone-${name}.wav`), wav(s.buf, peak));
}
console.log(`wrote ${Object.keys(TONES).length} tones to`, OUT.map((d) => d.slice(root.length + 1)).join(", "));
