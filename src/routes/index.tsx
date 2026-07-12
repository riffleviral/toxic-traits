import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { EnergyField } from "@/components/EnergyField";
import { FeedbackModal } from "@/components/FeedbackModal";
import { LYRICS } from "@/lib/lyrics";
import {
  NightfieldEngine,
  TRACKS,
  formatTime,
  type TrackId,
} from "@/lib/audio-engine";

export const Route = createFileRoute("/")({
  component: Nightfield,
});

function Nightfield() {
  const engineRef = useRef<NightfieldEngine | null>(null);
  if (!engineRef.current) engineRef.current = new NightfieldEngine();
  const engine = engineRef.current;

  const [currentId, setCurrentId] = useState<TrackId | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<TrackId | null>(null);

  const getAnalyser = useCallback(() => engine.analyser, [engine]);
  const getBeat = useCallback(
    () => ({ phase: engine.beatPhase(), bpm: engine.getBPM(engine.currentTrackId()) }),
    [engine],
  );

  // Pre-detect BPM for all tracks in the background so the tracklist labels
  // fill in and the pulse is ready by the time each track plays.
  useEffect(() => {
    (TRACKS.map((_, i) => i as TrackId)).forEach((id) => {
      void engine.detectBPM(id);
    });
  }, [engine]);

  useEffect(() => {
    engine.onEnded(() => {
      setPlaying(false);
      // auto-advance
      setCurrentId((prev) => {
        if (prev === null) return prev;
        setFeedbackFor(prev);
        const next = ((prev + 1) % 4) as TrackId;
        void handlePlay(next);
        return prev;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setElapsed(engine.elapsed());
      setDuration(engine.duration());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const handlePlay = useCallback(
    async (id: TrackId) => {
      if (currentId !== null && currentId !== id) {
        setSwitching(true);
        window.setTimeout(() => setSwitching(false), 700);
      }
      await engine.play(id);
      setCurrentId(id);
      setPlaying(true);
    },
    [engine, currentId],
  );

  const togglePlayPause = useCallback(async () => {
    if (currentId === null) {
      await handlePlay(0);
      return;
    }
    if (playing) {
      engine.pause();
      setPlaying(false);
    } else {
      await engine.play(currentId);
      setPlaying(true);
    }
  }, [engine, playing, currentId, handlePlay]);

  const skip = (dir: 1 | -1) => {
    const base = currentId ?? 0;
    const next = ((base + dir + 4) % 4) as TrackId;
    void handlePlay(next);
  };

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frac = Number(e.target.value) / 1000;
    engine.seek(frac);
    setElapsed(engine.elapsed());
  };

  const now = currentId !== null ? TRACKS[currentId] : null;

  return (
    <main className="relative min-h-[100svh] w-full overflow-hidden bg-background text-foreground">
      {/* vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(11,11,14,0.85) 100%)",
        }}
      />

      {/* the field */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          switching ? "opacity-30" : "opacity-100"
        }`}
      >
        <EnergyField
          getAnalyser={getAnalyser}
          getBeat={getBeat}
          active={playing}
          lyrics={currentId !== null ? LYRICS[currentId] : undefined}
          elapsed={elapsed}
        />
      </div>

      {/* top marque */}
      <header className="relative z-20 flex items-center justify-between px-5 pt-6 sm:px-10 sm:pt-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-bone-dim">
          saintrophez / ep oo
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-bone-dim">
          {new Date().getFullYear()}
        </div>
      </header>

      {/* hero */}
      <section className="relative z-20 flex flex-col items-center px-5 pt-[18vh] text-center sm:pt-[22vh]">
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.4em] text-ember">
          a four-track ep
        </p>
        <h1 className="font-display text-[22vw] sm:text-[15vw] md:text-[11rem] lg:text-[13rem]">
          SAINT
          <br />
          ROPHEZ
        </h1>
        <p className="mt-6 max-w-xs font-mono text-xs leading-relaxed text-bone-dim sm:max-w-sm sm:text-sm">
          Four tracks for the hour after everyone's gone to sleep.
          Press play — the field answers back.
        </p>
      </section>

      {/* spacer so field breathes */}
      <div className="h-[28vh] sm:h-[24vh]" />

      {/* tracks + player */}
      <section className="relative z-20 mx-auto w-full max-w-xl px-5 pb-40 sm:pb-48">
        <div className="mb-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-bone-dim">
          <span>tracklist</span>
          <span>{TRACKS.length} songs · 7 min</span>
        </div>
        <ol className="divide-y divide-border/60">
          {TRACKS.map((t, i) => {
            const id = i as TrackId;
            const isCurrent = currentId === id;
            const isPlayingHere = isCurrent && playing;
            return (
              <li key={t.index}>
                <button
                  onClick={() => {
                    if (isCurrent) void togglePlayPause();
                    else void handlePlay(id);
                  }}
                  className="group flex w-full items-center gap-4 py-4 text-left transition-colors sm:py-5"
                >
                  <span
                    className={`w-6 font-mono text-xs tabular-nums transition-colors ${
                      isCurrent ? "text-ember" : "text-bone-dim"
                    }`}
                  >
                    {String(t.index).padStart(2, "0")}
                  </span>
                  <span className="flex-1">
                    <span
                      className={`block font-display text-2xl leading-none transition-colors sm:text-3xl ${
                        isCurrent ? "text-ember" : "text-foreground"
                      }`}
                    >
                      {t.title}
                    </span>
                    <span className="mt-1.5 block font-mono text-[10px] uppercase tracking-[0.22em] text-bone-dim">
                      <TrackBPMLabel engine={engine} id={id} isCurrent={isCurrent} /> · {t.descriptor}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {isCurrent && (
                      <PlayingBars playing={isPlayingHere} />
                    )}
                    <span className="font-mono text-[11px] tabular-nums text-bone-dim">
                      {formatTime(t.duration)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-bone-dim">
          written & produced late, mixed later
        </p>
      </section>

      {/* rate this bubble */}
      {now && (
        <button
          onClick={() => setFeedbackFor(currentId)}
          className="fixed bottom-24 right-4 z-20 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-bone-dim backdrop-blur-md hover:text-ember sm:bottom-28"
        >
          rate this
        </button>
      )}

      {feedbackFor !== null && (
        <FeedbackModal track={TRACKS[feedbackFor]} onClose={() => setFeedbackFor(null)} />
      )}

      {/* dock player */}
      <div className="fixed inset-x-0 bottom-0 z-30">
        <div
          className="pointer-events-none absolute inset-x-0 -top-16 h-16"
          style={{
            background:
              "linear-gradient(to top, rgba(11,11,14,0.9), transparent)",
          }}
        />
        <div className="relative border-t border-border/70 bg-background/85 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-8 sm:pt-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.3em]">
              <span className="truncate text-bone-dim">
                {now ? (
                  <>
                    now playing ·{" "}
                    <span className="text-foreground">{now.title}</span>
                  </>
                ) : (
                  "tap play"
                )}
              </span>
              <span className="tabular-nums text-bone-dim">
                {formatTime(elapsed)} / {formatTime(duration || (now?.duration ?? 0))}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => skip(-1)}
                aria-label="Previous track"
                className="grid h-9 w-9 place-items-center rounded-full text-bone-dim transition-colors hover:text-foreground"
              >
                <SkipIcon dir="prev" />
              </button>

              <button
                onClick={togglePlayPause}
                aria-label={playing ? "Pause" : "Play"}
                className="relative grid h-14 w-14 place-items-center rounded-full bg-ember text-primary-foreground transition-transform active:scale-95"
                style={{
                  boxShadow:
                    "0 0 0 1px rgba(232,121,46,0.4), 0 0 40px -6px rgba(232,121,46,0.7)",
                }}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>

              <button
                onClick={() => skip(1)}
                aria-label="Next track"
                className="grid h-9 w-9 place-items-center rounded-full text-bone-dim transition-colors hover:text-foreground"
              >
                <SkipIcon dir="next" />
              </button>

              <div className="ml-2 flex-1">
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={duration ? Math.floor((elapsed / duration) * 1000) : 0}
                  onChange={onScrub}
                  aria-label="Seek"
                  className="nf-range w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .nf-range {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          height: 24px;
        }
        .nf-range::-webkit-slider-runnable-track {
          height: 2px;
          background: color-mix(in oklab, var(--color-bone) 20%, transparent);
          border-radius: 999px;
        }
        .nf-range::-moz-range-track {
          height: 2px;
          background: color-mix(in oklab, var(--color-bone) 20%, transparent);
          border-radius: 999px;
        }
        .nf-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 999px;
          background: var(--color-ember);
          margin-top: -5px;
          box-shadow: 0 0 12px rgba(232,121,46,0.8);
          border: none;
        }
        .nf-range::-moz-range-thumb {
          height: 12px;
          width: 12px;
          border-radius: 999px;
          background: var(--color-ember);
          border: none;
          box-shadow: 0 0 12px rgba(232,121,46,0.8);
        }
      `}</style>
    </main>
  );
}

function TrackBPMLabel({
  engine,
  id,
  isCurrent,
}: {
  engine: NightfieldEngine;
  id: TrackId;
  isCurrent: boolean;
}) {
  const [bpm, setBpm] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void engine.detectBPM(id).then((v) => {
      if (alive) setBpm(v);
    });
    return () => {
      alive = false;
    };
  }, [engine, id]);
  const label = bpm ? `${bpm} BPM` : "— BPM";
  return (
    <span className={isCurrent ? "text-ember" : undefined}>{label}</span>
  );
}

function PlayingBars({ playing }: { playing: boolean }) {
  return (
    <span
      className="inline-flex h-4 items-end gap-[2px]"
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-sm bg-ember"
          style={{
            height: playing ? "100%" : "35%",
            animation: playing
              ? `nfBar 900ms ease-in-out ${i * 120}ms infinite`
              : "none",
          }}
        />
      ))}
      <style>{`
        @keyframes nfBar {
          0%, 100% { height: 25%; }
          50% { height: 100%; }
        }
      `}</style>
    </span>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4l14 8-14 8V4z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}
function SkipIcon({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ transform: dir === "prev" ? "scaleX(-1)" : undefined }}
    >
      <path d="M6 4l11 8-11 8V4z" />
      <rect x="18" y="4" width="2" height="16" rx="1" />
    </svg>
  );
}
