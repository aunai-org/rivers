/**
 * Synthesized UI cues: terminal blips and a soft HUD chirp. No audio files are loaded.
 * Off by default; the choice is remembered in this browser under `<app id>:sound`.
 * Call initSound(id) once at start-up.
 */

let key = "app:sound";
let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = false;

/** Names the storage key and restores the saved on/off choice. */
export function initSound(appId: string) {
  key = `${appId}:sound`;
  enabled = read();
}

function read(): boolean {
  try {
    return localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
}

export function soundOn(): boolean {
  return enabled;
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    // Storage can be blocked; the toggle still works for this visit.
  }
  if (on) play((ac, t) => blips(ac, t, [660, 990, 1320], 0.06));
}

/** Runs a cue only when sound is on, resuming the context first if the browser paused it. */
function play(cue: (ac: AudioContext, t: number) => void) {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
  } catch {
    return;
  }
  const ac = ctx;
  if (ac.state === "suspended") void ac.resume().then(() => cue(ac, ac.currentTime));
  else cue(ac, ac.currentTime);
}

function tone(ac: AudioContext, t: number, freq: number, type: OscillatorType, dur: number, amp: number, bend = 1) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (bend !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * bend), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(amp, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A terminal blip: short sine notes in a row. */
function blips(ac: AudioContext, t: number, notes: number[], amp = 0.08, gap = 0.07) {
  notes.forEach((hz, i) => tone(ac, t + i * gap, hz, "sine", 0.09, amp));
}

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const n = Math.floor(ac.sampleRate * 0.14);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  noiseBuf = buf;
  return buf;
}

/**
 * A card opens: a quiet, low-passed hiss sweeps down under three rounded chirps,
 * so it reads as "panel opened" without a harsh edge.
 */
export function cueOpen() {
  play((ac, t) => {
    const src = ac.createBufferSource();
    src.buffer = noise(ac);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    lp.Q.value = 0.8;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.018, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(lp).connect(ng).connect(ac.destination);
    src.start(t);
    src.stop(t + 0.14);
    tone(ac, t, 1320, "sine", 0.07, 0.035, 1.25);
    tone(ac, t + 0.045, 880, "triangle", 0.08, 0.025, 0.8);
    tone(ac, t + 0.095, 1760, "sine", 0.09, 0.02, 1.1);
  });
}

/** Choosing a node: a soft sonar ping with a fainter echo, like a signal found far away. */
export function cuePing() {
  play((ac, t) => {
    tone(ac, t, 1040, "sine", 0.28, 0.05, 0.94);
    tone(ac, t + 0.004, 1046, "sine", 0.28, 0.025, 0.94);
    tone(ac, t + 0.16, 1040, "sine", 0.22, 0.018, 0.94);
    tone(ac, t + 0.3, 1040, "sine", 0.18, 0.008, 0.94);
  });
}

/** Choosing an item: a rising two-note confirm. */
export function cueSelect() {
  play((ac, t) => blips(ac, t, [620, 980]));
}

/** A node pops in as its arc lands; each one a little higher, kept very quiet. */
export function cueLand(index: number) {
  play((ac, t) => tone(ac, t, 1100 * Math.pow(1.06, Math.min(index, 12)), "sine", 0.06, 0.025));
}

/** Opening a cluster badge: a low three-note pad tone. */
export function cueCluster() {
  play((ac, t) => blips(ac, t, [320, 480, 320], 0.07, 0.06));
}

/** Clearing the selection: a falling pair. */
export function cueClear() {
  play((ac, t) => blips(ac, t, [520, 300], 0.06, 0.06));
}

/** Panel toggles and filter switches: a single soft tick. */
export function cueTick() {
  play((ac, t) => tone(ac, t, 1500, "sine", 0.04, 0.03));
}

/**
 * The land inflating by river: a low swell that rises like a filling breath, with a soft whoosh, over about the
 * 2.4 s the morph takes. Deflating plays it falling and shorter (0.9 s).
 */
export function cueInflate(on: boolean) {
  play((ac, t) => {
    const dur = on ? 2.2 : 0.9;
    const [from, to] = on ? [70, 190] : [190, 70];
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.35);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(ac.destination);
    // Two slightly detuned sines make the swell; a fifth above gives it some shimmer.
    for (const [mul, amp] of [[1, 1], [1.006, 0.7], [1.5, 0.25]] as const) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(from * mul, t);
      osc.frequency.exponentialRampToValueAtTime(to * mul, t + dur);
      g.gain.value = amp;
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
    // A band-passed hiss that sweeps with the land, like air moving.
    const src = ac.createBufferSource();
    src.buffer = noise(ac);
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(on ? 300 : 1400, t);
    bp.frequency.exponentialRampToValueAtTime(on ? 1400 : 300, t + dur);
    const ng = ac.createGain();
    ng.gain.value = 0.25;
    src.connect(bp).connect(ng).connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
  });
}
