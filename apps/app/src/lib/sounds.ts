// Original alert tones, synthesised with Web Audio: nothing copied from F1's own sounds.
export type AlertKind = "flag" | "neutral" | "stewards" | "radio";
/** Spoken clips in public/sounds/voice, generated with ElevenLabs (voice "George"). */
export type Voice =
  | "green" | "yellow" | "double-yellow" | "sc" | "sc-ending" | "vsc" | "vsc-ending" | "red" | "chequered"
  | "penalty" | "investigation" | "cleared" | "radio";

/** [frequency Hz, start s, length s, wave] */
type Note = [number, number, number, OscillatorType];
const TONES: Record<AlertKind, Note[]> = {
  flag: [[880, 0, 0.12, "sine"], [1320, 0.15, 0.2, "sine"]], // rising double beep
  neutral: [[440, 0, 0.28, "triangle"], [330, 0.32, 0.4, "triangle"], [440, 0.78, 0.28, "triangle"]], // low two-tone, SC/VSC/red
  stewards: [[1046, 0, 0.1, "sine"]], // short blip
  radio: [[1200, 0.1, 0.06, "sine"], [900, 0.18, 0.08, "sine"]], // after a burst of squelch
};

let ctx: AudioContext | null = null;
const audio = () => (typeof AudioContext === "undefined" ? null : (ctx ??= new AudioContext()));

/** Browsers start audio suspended until a user gesture; call this from one. */
export function unlock() {
  void audio()?.resume().catch(() => {});
}

/** Plays the tone and returns how long it lasts (ms). */
export function chime(kind: AlertKind) {
  const ms = Math.max(...TONES[kind].map(([, at, length]) => at + length)) * 1000;
  const c = audio();
  if (!c) return ms;
  if (c.state !== "running") unlock();
  const now = c.currentTime;
  const envelope = (at: number, length: number, peak: number) => {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now + at);
    g.gain.exponentialRampToValueAtTime(peak, now + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + at + length);
    g.connect(c.destination);
    return g;
  };
  if (kind === "radio") {
    const noise = c.createBuffer(1, Math.round(c.sampleRate * 0.08), c.sampleRate);
    noise.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
    const src = c.createBufferSource();
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2000;
    src.buffer = noise;
    src.connect(band).connect(envelope(0, 0.08, 0.15));
    src.start(now);
  }
  for (const [freq, at, length, type] of TONES[kind]) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(envelope(at, length, 0.2));
    o.start(now + at);
    o.stop(now + at + length + 0.02);
  }
  return ms;
}

let speaker: HTMLAudioElement | null = null;
/** Speaks a clip after `afterMs`; a newer clip cuts off an older one. A clip that fails to load is skipped. */
export function say(voice: Voice, afterMs = 0) {
  if (typeof Audio === "undefined") return;
  speaker?.pause();
  const a = (speaker = new Audio(`/sounds/voice/${voice}.mp3`)); // starts loading during the chime
  setTimeout(() => speaker === a && void a.play().catch(() => {}), afterMs);
}
