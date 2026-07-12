// Procedural ambient audio engine for the Nightfield EP.
// Each "track" is a distinct synthesized scene so the energy field has real
// spectral content to react to without any external audio files.

import { analyze } from "web-audio-beat-detector";

export type TrackId = 0 | 1 | 2 | 3;

export interface TrackMeta {
  index: number;
  title: string;
  duration: number; // seconds
  descriptor: string;
  fallbackBPM: number; // used if detection fails / low confidence
}

export const TRACKS: TrackMeta[] = [
  { index: 1, title: "Slow Orbit", duration: 96, descriptor: "sub drift, no drums", fallbackBPM: 62 },
  { index: 2, title: "Cassini Dream", duration: 108, descriptor: "swells, distant kick", fallbackBPM: 74 },
  { index: 3, title: "Ember, Ember", duration: 102, descriptor: "the drop, halfway in", fallbackBPM: 88 },
  { index: 4, title: "Return / Reentry", duration: 120, descriptor: "long tail, breathing out", fallbackBPM: 58 },
];

type AnyCtx = AudioContext | OfflineAudioContext;
interface Voice {
  stop: (t: number) => void;
}

// ————————————————————————————————————————————————————————
// Scene builders — pure fns of (ctx, bus). Return list of voices to stop.
// ————————————————————————————————————————————————————————
function sceneOrbit(ctx: AnyCtx, bus: GainNode): Voice[] {
  const voices: Voice[] = [];
  const now = ctx.currentTime;
  const drone = (freq: number, gain: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.detune.value = detune;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 380;
    filt.Q.value = 6;
    const g = ctx.createGain();
    g.gain.value = gain;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + Math.random() * 0.04;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(filt.frequency);
    o.connect(filt).connect(g).connect(bus);
    o.start(now);
    lfo.start(now);
    voices.push({ stop: (t) => { o.stop(t); lfo.stop(t); } });
  };
  drone(55, 0.32);
  drone(55, 0.22, +7);
  drone(82.4, 0.18, -5);
  drone(110, 0.08, +12);
  voices.push(makeNoise(ctx, bus, 0.04, 4200, 0.9));
  return voices;
}

function sceneCassini(ctx: AnyCtx, bus: GainNode): Voice[] {
  const voices: Voice[] = [];
  const now = ctx.currentTime;
  const pad = (freq: number, gain: number) => {
    const o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = freq * 1.005;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 900;
    filt.Q.value = 3;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const period = 8;
    for (let t = 0; t < 200; t += period) {
      g.gain.linearRampToValueAtTime(gain, now + t + 3);
      g.gain.linearRampToValueAtTime(gain * 0.3, now + t + period);
    }
    o1.connect(filt);
    o2.connect(filt);
    filt.connect(g).connect(bus);
    o1.start(now);
    o2.start(now);
    voices.push({ stop: (t) => { o1.stop(t); o2.stop(t); } });
  };
  pad(146.83, 0.18);
  pad(220, 0.14);
  pad(261.63, 0.10);
  pad(73.42, 0.22);
  const kickInterval = 2.03;
  for (let t = 6; t < 200; t += kickInterval) schedKick(ctx, bus, now + t, 0.55);
  return voices;
}

function sceneEmber(ctx: AnyCtx, bus: GainNode): Voice[] {
  const voices: Voice[] = [];
  const now = ctx.currentTime;
  const dropAt = 42;

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 55;
  const subG = ctx.createGain();
  subG.gain.value = 0.0001;
  subG.gain.linearRampToValueAtTime(0.18, now + 8);
  subG.gain.setValueAtTime(0.18, now + dropAt - 0.5);
  subG.gain.linearRampToValueAtTime(0.55, now + dropAt);
  sub.connect(subG).connect(bus);
  sub.start(now);
  voices.push({ stop: (t) => sub.stop(t) });

  const pad = ctx.createOscillator();
  pad.type = "sawtooth";
  pad.frequency.value = 220;
  const padF = ctx.createBiquadFilter();
  padF.type = "lowpass";
  padF.frequency.value = 500;
  padF.Q.value = 4;
  const padG = ctx.createGain();
  padG.gain.value = 0.12;
  pad.connect(padF).connect(padG).connect(bus);
  padF.frequency.setValueAtTime(500, now);
  padF.frequency.setValueAtTime(500, now + dropAt - 4);
  padF.frequency.exponentialRampToValueAtTime(2800, now + dropAt);
  padF.frequency.exponentialRampToValueAtTime(1200, now + dropAt + 20);
  pad.start(now);
  voices.push({ stop: (t) => pad.stop(t) });

  const riser = makeNoise(ctx, bus, 0.0001, 800, 0.9);
  voices.push(riser);
  riser.gainNode.gain.linearRampToValueAtTime(0.0001, now + dropAt - 6);
  riser.gainNode.gain.linearRampToValueAtTime(0.35, now + dropAt);
  riser.gainNode.gain.linearRampToValueAtTime(0.05, now + dropAt + 1);
  riser.filterNode.frequency.setValueAtTime(400, now + dropAt - 6);
  riser.filterNode.frequency.exponentialRampToValueAtTime(9000, now + dropAt);

  for (let t = 4; t < dropAt; t += 4) schedKick(ctx, bus, now + t, 0.45);
  const beat = 60 / 88;
  for (let t = dropAt; t < 200; t += beat) {
    const strong = Math.floor((t - dropAt) / beat) % 2 === 0;
    schedKick(ctx, bus, now + t, strong ? 0.85 : 0.3);
  }
  for (let t = dropAt + beat / 2; t < 200; t += beat) schedHat(ctx, bus, now + t, 0.18);
  return voices;
}

function sceneReentry(ctx: AnyCtx, bus: GainNode): Voice[] {
  const voices: Voice[] = [];
  const now = ctx.currentTime;
  const drone = (freq: number, gain: number) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 650;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(filt).connect(g).connect(bus);
    o.start(now);
    g.gain.setValueAtTime(gain, now);
    g.gain.linearRampToValueAtTime(gain * 0.2, now + 118);
    voices.push({ stop: (t) => o.stop(t) });
  };
  drone(65.4, 0.28);
  drone(98, 0.2);
  drone(196, 0.09);

  const breath = makeNoise(ctx, bus, 0.06, 1200, 0.5);
  voices.push(breath);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.05;
  lfo.connect(lfoG).connect(breath.gainNode.gain);
  lfo.start(now);
  voices.push({ stop: (t) => lfo.stop(t) });
  return voices;
}

const SCENES = [sceneOrbit, sceneCassini, sceneEmber, sceneReentry] as const;

function schedKick(ctx: AnyCtx, bus: GainNode, when: number, amp: number) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(120, when);
  o.frequency.exponentialRampToValueAtTime(40, when + 0.18);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(amp, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
  o.connect(g).connect(bus);
  o.start(when);
  o.stop(when + 0.4);
}

function schedHat(ctx: AnyCtx, bus: GainNode, when: number, amp: number) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(amp, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  src.connect(hp).connect(g).connect(bus);
  src.start(when);
  src.stop(when + 0.08);
}

interface NoiseVoice extends Voice {
  gainNode: GainNode;
  filterNode: BiquadFilterNode;
}
function makeNoise(
  ctx: AnyCtx,
  bus: GainNode,
  gainVal: number,
  filterFreq: number,
  q: number,
): NoiseVoice {
  const bufSize = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < bufSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99 * b0 + 0.0555 * white;
    b1 = 0.96 * b1 + 0.2965 * white;
    b2 = 0.57 * b2 + 1.0526 * white;
    d[i] = (b0 + b1 + b2 + white * 0.1) * 0.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = filterFreq;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gainVal;
  src.connect(filt).connect(g).connect(bus);
  src.start();
  return {
    stop: (t: number) => src.stop(t),
    gainNode: g,
    filterNode: filt,
  };
}

// ————————————————————————————————————————————————————————
// Engine
// ————————————————————————————————————————————————————————
const DEFAULT_BPM = 72;

export class NightfieldEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  masterGain: GainNode | null = null;
  private voices: Voice[] = [];
  private trackGain: GainNode | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  private trackDur = 0;
  private currentTrack: TrackId | null = null;
  private playing = false;
  private onEndCb: (() => void) | null = null;
  private endTimer: number | null = null;

  // Per-track BPM cache. Values: number = detected/fallback; "pending" = analyzing.
  private bpmCache = new Map<TrackId, number>();
  private bpmPending = new Set<TrackId>();

  async ensure() {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.82;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  onEnded(cb: () => void) { this.onEndCb = cb; }
  isPlaying() { return this.playing; }
  currentTrackId() { return this.currentTrack; }

  progress() {
    if (!this.ctx || this.currentTrack === null) return 0;
    const t = this.playing
      ? this.ctx.currentTime - this.startedAt
      : this.pausedAt - this.startedAt;
    return Math.min(1, Math.max(0, t / this.trackDur));
  }
  elapsed() { return this.progress() * this.trackDur; }
  duration() { return this.trackDur; }

  /** BPM for a track — detected value, fallback, or default while analyzing. */
  getBPM(id: TrackId | null): number {
    if (id === null) return DEFAULT_BPM;
    const cached = this.bpmCache.get(id);
    if (cached && cached > 0) return cached;
    return TRACKS[id]?.fallbackBPM ?? DEFAULT_BPM;
  }

  /** 0..1 phase within the current beat, based on playback position. */
  beatPhase(): number {
    if (this.currentTrack === null) return 0;
    const bpm = this.getBPM(this.currentTrack);
    const beatSec = 60 / bpm;
    const e = this.elapsed();
    return (e % beatSec) / beatSec;
  }

  async play(id: TrackId) {
    await this.ensure();
    if (this.currentTrack !== id) {
      this.stopVoices(0.6);
      this.currentTrack = id;
      this.trackDur = TRACKS[id].duration;
      this.startedAt = this.ctx!.currentTime;
      this.buildTrack(id);
      // fire-and-forget BPM detection; result caches for next play
      void this.detectBPM(id);
    } else if (!this.playing) {
      const offset = this.pausedAt - this.startedAt;
      this.startedAt = this.ctx!.currentTime - offset;
      this.trackGain?.gain.cancelScheduledValues(this.ctx!.currentTime);
      this.trackGain?.gain.linearRampToValueAtTime(1, this.ctx!.currentTime + 0.4);
    }
    this.playing = true;
    this.scheduleEnd();
  }

  pause() {
    if (!this.ctx || !this.playing) return;
    this.pausedAt = this.ctx.currentTime;
    this.playing = false;
    this.trackGain?.gain.cancelScheduledValues(this.ctx.currentTime);
    this.trackGain?.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25);
    if (this.endTimer) window.clearTimeout(this.endTimer);
  }

  seek(fraction: number) {
    if (!this.ctx || this.currentTrack === null) return;
    const target = Math.max(0, Math.min(1, fraction)) * this.trackDur;
    const wasPlaying = this.playing;
    const id = this.currentTrack;
    this.stopVoices(0.05);
    this.startedAt = this.ctx.currentTime - target;
    this.buildTrack(id);
    if (!wasPlaying) {
      this.pausedAt = this.ctx.currentTime;
      this.trackGain?.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    } else {
      this.scheduleEnd();
    }
  }

  private scheduleEnd() {
    if (this.endTimer) window.clearTimeout(this.endTimer);
    if (!this.ctx) return;
    const remaining = (this.trackDur - this.elapsed()) * 1000;
    this.endTimer = window.setTimeout(() => {
      this.playing = false;
      this.onEndCb?.();
    }, Math.max(50, remaining));
  }

  private stopVoices(fade: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.trackGain?.gain.cancelScheduledValues(t);
    this.trackGain?.gain.linearRampToValueAtTime(0.0001, t + fade);
    const stopAt = t + fade + 0.05;
    this.voices.forEach((v) => { try { v.stop(stopAt); } catch { /* ignore */ } });
    this.voices = [];
    setTimeout(() => {
      try { this.trackGain?.disconnect(); } catch { /* ignore */ }
    }, (fade + 0.2) * 1000);
  }

  private buildTrack(id: TrackId) {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.4);
    bus.connect(this.masterGain!);
    this.trackGain = bus;
    this.voices = SCENES[id](ctx, bus);
  }

  // ————————————————————————————————————————————————————————
  // BPM detection: render a short offline preview and analyze.
  // Cached forever per track. Silent failures fall back to TRACKS[id].fallbackBPM.
  // ————————————————————————————————————————————————————————
  async detectBPM(id: TrackId): Promise<number> {
    if (this.bpmCache.has(id)) return this.bpmCache.get(id)!;
    if (this.bpmPending.has(id)) return this.getBPM(id);
    this.bpmPending.add(id);

    const fallback = TRACKS[id].fallbackBPM;
    try {
      // Ember has its drop at 42s — render from a bit before through after so
      // there's a strong beat. Other tracks: render an early window.
      const startOffset = id === 2 ? 40 : 0;
      const seconds = id === 2 ? 24 : 20;
      const sampleRate = 44100;
      const OfflineCtor =
        window.OfflineAudioContext ||
        (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
          .webkitOfflineAudioContext;
      const totalSec = startOffset + seconds;
      const offline = new OfflineCtor(1, sampleRate * totalSec, sampleRate);
      const bus = offline.createGain();
      bus.gain.value = 1;
      bus.connect(offline.destination);
      SCENES[id](offline, bus);
      const rendered = await offline.startRendering();

      // Slice tail if startOffset > 0 so we analyze the more energetic window.
      let bufToAnalyze: AudioBuffer = rendered;
      if (startOffset > 0) {
        const tailLen = Math.floor(seconds * sampleRate);
        const startIdx = rendered.length - tailLen;
        const scratch = new OfflineCtor(1, tailLen, sampleRate);
        const tail = scratch.createBuffer(1, tailLen, sampleRate);
        tail.copyToChannel(rendered.getChannelData(0).subarray(startIdx), 0);
        bufToAnalyze = tail;
      }

      const detected = await analyze(bufToAnalyze);
      // Sanity gate: 40..180 BPM band. Anything outside = low-confidence, use fallback.
      if (!isFinite(detected) || detected < 40 || detected > 180) {
        this.bpmCache.set(id, fallback);
        return fallback;
      }
      this.bpmCache.set(id, Math.round(detected));
      return this.bpmCache.get(id)!;
    } catch {
      this.bpmCache.set(id, fallback);
      return fallback;
    } finally {
      this.bpmPending.delete(id);
    }
  }
}

export function formatTime(sec: number) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
