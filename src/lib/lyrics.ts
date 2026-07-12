export type LyricLine = { time: number; text: string };

// Keyed by TrackId (0..3), matching TRACKS in audio-engine.ts.
export const LYRICS: Record<number, LyricLine[]> = {
  0: [
    // Slow Orbit — sub drift, no drums (96s)
    { time: 10, text: "no drums tonight, just the hum" },
    { time: 26, text: "we circle slow, the room breathing" },
    { time: 46, text: "nothing to land on, nothing to lose" },
    { time: 68, text: "just the drift, just the low light" },
    { time: 84, text: "slow orbit. slow orbit." },
  ],
  1: [
    // Cassini Dream — swells, distant kick (108s)
    { time: 12, text: "a kick from somewhere far off" },
    { time: 30, text: "the swell comes in and holds" },
    { time: 52, text: "we're rings around a quiet planet" },
    { time: 76, text: "waiting on the next pulse" },
    { time: 96, text: "cassini dream. cassini dream." },
  ],
  2: [
    // Ember, Ember — the drop, halfway in (102s), drop at 42s
    { time: 14, text: "hold the breath before the fall" },
    { time: 30, text: "count it down, count it slow" },
    { time: 42, text: "here it comes—" },
    { time: 44, text: "ember, ember, ember" },
    { time: 60, text: "burning through the back half now" },
    { time: 82, text: "let it catch. let it go." },
  ],
  3: [
    // Return / Reentry — long tail, breathing out (120s)
    { time: 16, text: "the field lets go of us slow" },
    { time: 38, text: "atmosphere thick around the edges" },
    { time: 64, text: "breathing out what we came in with" },
    { time: 90, text: "reentry. soft landing." },
    { time: 108, text: "the record's almost done." },
  ],
};
