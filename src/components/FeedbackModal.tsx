import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TrackMeta } from "@/lib/audio-engine";

const FEEDBACK_TAGS = [
  "hypnotic",
  "replay",
  "hits different late night",
  "too long",
  "would skip",
  "sit with it",
];

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function FeedbackModal({ track, onClose }: { track: TrackMeta; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function toggleTag(t: string) {
    setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  }

  async function submit() {
    if (!rating) return;
    setSubmitting(true);
    const { error } = await supabase.from("feedback").insert({
      track_slug: slugify(track.title),
      rating,
      tags,
      comment: comment.trim() || null,
    });
    setSubmitting(false);
    if (!error) setDone(true);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="relative w-full max-w-md rounded-t-2xl border border-border/70 bg-card p-6 sm:rounded-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 font-mono text-xs text-bone-dim hover:text-foreground"
          aria-label="Close"
        >
          ×
        </button>
        {!done ? (
          <>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-bone-dim">
              what did you think
            </p>
            <h2 className="font-display mt-1 text-3xl leading-none">{track.title}</h2>

            <div className="mt-5 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  aria-label={`${n} stars`}
                  className={`text-2xl transition-colors ${n <= rating ? "text-ember" : "text-bone-dim"}`}
                >
                  ★
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {FEEDBACK_TAGS.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    className={`font-mono rounded-full border px-3 py-1 text-[11px] uppercase tracking-wider transition-colors ${
                      on ? "border-ember bg-ember/10 text-ember" : "border-border text-bone-dim hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="anything else (optional)"
              rows={3}
              className="font-mono mt-5 w-full resize-none rounded-md border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-bone-dim focus:border-ember focus:outline-none"
            />

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={onClose} className="font-mono text-xs uppercase tracking-widest text-bone-dim">
                skip
              </button>
              <button
                onClick={submit}
                disabled={!rating || submitting}
                className="font-mono rounded-full bg-ember px-5 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-40"
              >
                {submitting ? "sending" : "send"}
              </button>
            </div>
          </>
        ) : (
          <div className="py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ember">received</p>
            <h2 className="font-display mt-2 text-3xl">thanks for listening.</h2>
            <button onClick={onClose} className="font-mono mt-5 text-xs uppercase tracking-widest text-bone-dim">
              close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
