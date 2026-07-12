import { useEffect, useRef } from "react";
import type { LyricLine } from "@/lib/lyrics";

interface BeatInfo {
  phase: number; // 0..1 within current beat
  bpm: number;
}

interface Props {
  getAnalyser: () => AnalyserNode | null;
  getBeat?: () => BeatInfo;
  active: boolean;
  lyrics?: LyricLine[];
  elapsed?: number;
}

type LyricParticle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  spark: boolean;
};

type FlyingLetter = {
  ch: string;
  x: number; y: number;
  targetX: number; targetY: number;
  born: number;
  dissolveAt: number;
  dissolved: boolean;
  opacity: number;
};

// Particle field driven by AnalyserNode. 2D canvas — reliable, no GPU adapter needed.
export function EnergyField({ getAnalyser, getBeat, active, lyrics, elapsed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lyricParticlesRef = useRef<LyricParticle[]>([]);
  const lettersRef = useRef<FlyingLetter[]>([]);
  const shownLineIndexRef = useRef<number>(-1);
  const lyricsRef = useRef(lyrics ?? []);
  const elapsedRef = useRef(elapsed ?? 0);
  const activeRef = useRef(active);

  useEffect(() => { elapsedRef.current = elapsed ?? 0; }, [elapsed]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => {
    lyricsRef.current = lyrics ?? [];
    shownLineIndexRef.current = -1;
    lettersRef.current = [];
  }, [lyrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Particles arranged in a rough disc; each has a base angle and radius.
    const PARTICLE_COUNT = 900;
    type P = { a: number; r: number; s: number; band: number };
    const parts: P[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r = Math.pow(Math.random(), 0.6);
      parts.push({
        a: Math.random() * Math.PI * 2,
        r,
        s: 0.5 + Math.random() * 1.5,
        band: Math.floor(Math.random() * 32),
      });
    }

    const freqData = new Uint8Array(512);
    const timeData = new Uint8Array(512);

    function checkLyrics(now: number) {
      const lines = lyricsRef.current;
      const t = elapsedRef.current;
      if (!lines.length) return;
      let idx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].time <= t) idx = i; else break;
      }
      if (idx !== shownLineIndexRef.current && idx >= 0) {
        shownLineIndexRef.current = idx;
        const line = lines[idx];
        const cx = w / 2;
        const cy = h / 2;
        const startY = h * 0.78;
        const targetY = cy - 30;
        const size = Math.min(w * 0.05, 24);
        ctx.font = `500 ${size}px "JetBrains Mono", monospace`;
        const totalW = ctx.measureText(line.text).width;
        let x = cx - totalW / 2;
        const dissolveDelay = 3600;
        for (let i = 0; i < line.text.length; i++) {
          const ch = line.text[i];
          const chW = ctx.measureText(ch).width;
          lettersRef.current.push({
            ch,
            x: x + chW / 2,
            y: startY,
            targetX: x + chW / 2,
            targetY,
            born: now,
            dissolveAt: now + dissolveDelay + i * 30,
            dissolved: false,
            opacity: 0,
          });
          x += chW;
        }
      }
    }

    function letterToParticles(l: FlyingLetter, highs: number) {
      const count = 8;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 2;
        lyricParticlesRef.current.push({
          x: l.x + (Math.random() - 0.5) * 6,
          y: l.y + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.3,
          life: 0,
          maxLife: 1600 + Math.random() * 800,
          size: 1 + Math.random() * 2,
          spark: Math.random() < highs * 0.4,
        });
      }
    }

    let smoothBass = 0;
    let smoothMid = 0;
    let smoothHigh = 0;
    let smoothOverall = 0;
    let phase = 0;
    let lastT = performance.now();

    const render = (now: number) => {
      const dt = Math.min(50, now - lastT) / 1000;
      lastT = now;
      phase += dt;

      const analyser = getAnalyser();
      let bass = 0, mid = 0, high = 0, overall = 0;
      if (analyser && active) {
        const bins = Math.min(freqData.length, analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);
        // Roughly: bins 0..bins/8 = bass, /8../3 = mid, /3..end = high
        const bassEnd = Math.floor(bins / 10);
        const midEnd = Math.floor(bins / 3);
        let sB = 0, sM = 0, sH = 0, sO = 0;
        for (let i = 0; i < bins; i++) {
          const v = freqData[i] / 255;
          sO += v;
          if (i < bassEnd) sB += v;
          else if (i < midEnd) sM += v;
          else sH += v;
        }
        bass = sB / bassEnd;
        mid = sM / (midEnd - bassEnd);
        high = sH / (bins - midEnd);
        overall = sO / bins;
      }

      // Smooth (attack fast, release slower) so calm sections truly settle.
      const smooth = (prev: number, next: number) => {
        const k = next > prev ? 0.35 : 0.06;
        return prev + (next - prev) * k;
      };
      smoothBass = smooth(smoothBass, bass);
      smoothMid = smooth(smoothMid, mid);
      smoothHigh = smooth(smoothHigh, high);
      smoothOverall = smooth(smoothOverall, overall);

      // Background: never fully clear — dark trail for motion blur feel.
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(11, 11, 14, 0.22)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.28;

      // Beat pulse: exponential decay from beat onset (phase = 0 in current beat).
      // Intensity scales with amplitude so silent sections don't throb.
      const beat = getBeat ? getBeat() : { phase: 0, bpm: 72 };
      const beatDecay = Math.exp(-beat.phase * 5); // 1 at onset → ~0 by end of beat
      const pulseIntensity = active ? beatDecay * (0.35 + smoothOverall * 0.9) : 0;
      const onBeat = beatDecay > 0.97 && active;

      checkLyrics(now);

      const spread = 1 + smoothBass * 1.6 + smoothOverall * 0.4 + pulseIntensity * 0.25;
      const speed = 0.08 + smoothMid * 0.9 + smoothBass * 0.3;

      // Core glow — orb behind everything, pulses with the beat
      const coreR = baseR * (0.55 + smoothBass * 0.45 + pulseIntensity * 0.2);
      const coreAlpha = 0.18 + smoothOverall * 0.55 + pulseIntensity * 0.35;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.4);
      grad.addColorStop(0, `rgba(232, 121, 46, ${Math.min(1, coreAlpha)})`);
      grad.addColorStop(0.45, `rgba(232, 121, 46, ${coreAlpha * 0.25})`);
      grad.addColorStop(1, "rgba(232, 121, 46, 0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Waveform ring — subtle, driven by timeDomainData
      if (analyser && active) {
        ctx.strokeStyle = `rgba(242, 240, 234, ${0.08 + smoothHigh * 0.35})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const N = 180;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const idx = Math.floor(t * timeData.length);
          const amp = (timeData[idx] - 128) / 128;
          const r = baseR * (1 + amp * 0.35 * (0.4 + smoothOverall));
          const a = t * Math.PI * 2;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // Particles
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.a += dt * speed * p.s * 0.6;
        const bandEnergy =
          p.band < 8 ? smoothBass : p.band < 20 ? smoothMid : smoothHigh;
        const rr =
          baseR *
          (0.35 + p.r * 1.2 * spread) *
          (1 + Math.sin(phase * 0.6 + p.a * 2) * 0.04);
        const x = cx + Math.cos(p.a) * rr;
        const y = cy + Math.sin(p.a) * rr;
        const alpha =
          0.05 +
          bandEnergy * 0.55 +
          (1 - p.r) * 0.15 * (0.3 + smoothOverall);
        const size = 0.6 + bandEnergy * 2.2 + (1 - p.r) * 0.6;

        // color: mostly ember; some bone-white sparks on highs
        const isSpark = p.band >= 24 && smoothHigh > 0.35;
        if (isSpark) {
          ctx.fillStyle = `rgba(242, 240, 234, ${Math.min(1, alpha * 0.9)})`;
        } else {
          const w1 = Math.min(1, alpha * 1.1);
          ctx.fillStyle = `rgba(232, 121, 46, ${w1})`;
        }
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Lyric letters — rise, then dissolve into particles on beat
      ctx.globalCompositeOperation = "lighter";
      const lyricSize = Math.min(w * 0.05, 24);
      ctx.font = `500 ${lyricSize}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const letters = lettersRef.current;
      for (let i = letters.length - 1; i >= 0; i--) {
        const l = letters[i];
        if (l.dissolved) { letters.splice(i, 1); continue; }
        l.opacity = Math.min(1, l.opacity + dt * 2);
        l.y += (l.targetY - l.y) * 0.04;
        l.x += (l.targetX - l.x) * 0.04;
        if (now >= l.dissolveAt && onBeat) {
          letterToParticles(l, smoothHigh);
          l.dissolved = true;
          continue;
        }
        ctx.fillStyle = `rgba(242, 240, 234, ${l.opacity * 0.9})`;
        ctx.fillText(l.ch, l.x, l.y);
      }

      // Dissolved-letter particles
      const lp = lyricParticlesRef.current;
      for (let i = lp.length - 1; i >= 0; i--) {
        const p = lp[i];
        p.life += dt * 1000;
        if (p.life >= p.maxLife) { lp.splice(i, 1); continue; }
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        const t = p.life / p.maxLife;
        const alpha = 1 - t;
        ctx.fillStyle = p.spark
          ? `rgba(242, 240, 234, ${alpha})`
          : `rgba(232, 121, 46, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [getAnalyser, getBeat, active]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
