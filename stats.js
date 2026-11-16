/*
 * STATISTICS
 * Pure aggregation for per-game results. The hub records a finished round here;
 * the profile dialog reads it back. Keep this module free of storage and DOM so
 * it can be unit tested and later synced through the store seam.
 *
 * Shape kept per game id:
 *   { played, won, lost, bestTime, fewestMoves, hintsUsed, streak, bestStreak }
 */

function blankGame() {
  return { played: 0, won: 0, lost: 0, bestTime: null, fewestMoves: null, hintsUsed: 0, streak: 0, bestStreak: 0 };
}

export function normalizeStats(stats = {}) {
  const result = {};
  for (const [id, entry] of Object.entries(stats)) {
    result[id] = { ...blankGame(), ...entry };
  }
  return result;
}

/* Record a finished round. `outcome` is 'won' or 'lost'. Times/moves only count
   when provided and only improve the stored best. */
export function recordResult(stats, id, { outcome = 'won', time = null, moves = null, hints = 0 } = {}) {
  const entry = stats[id] ?? (stats[id] = blankGame());
  entry.played += 1;
  entry.hintsUsed += Math.max(0, Math.floor(Number(hints) || 0));
  if (outcome === 'won') {
    entry.won += 1;
    entry.streak += 1;
    entry.bestStreak = Math.max(entry.bestStreak, entry.streak);
    if (Number.isFinite(time)) entry.bestTime = entry.bestTime === null ? time : Math.min(entry.bestTime, time);
    if (Number.isFinite(moves)) entry.fewestMoves = entry.fewestMoves === null ? moves : Math.min(entry.fewestMoves, moves);
  } else {
    entry.lost += 1;
    entry.streak = 0;
  }
  return entry;
}

export function winRate(entry) {
  if (!entry?.played) return 0;
  return Math.round((entry.won / entry.played) * 100);
}
