/*
 * CREDIT ECONOMY
 * Credits are the soft currency for hints. They are earned from finished games
 * but capped per calendar day so an endlessly replayable puzzle cannot be farmed
 * without limit. XP is deliberately NOT capped: levels and titles still move at
 * full speed, only the hint wallet slows down.
 *
 * The cap is tracked on the profile with a date stamp, so it resets naturally at
 * midnight and needs no timers. Keeping this pure means Supabase sync can merge
 * balances and daily totals without touching game code.
 */
import { todaySeed } from './rng.js';

export const DAILY_CREDIT_CAP = 150;

export function earnedToday(profile, today = todaySeed()) {
  return profile.earnDate === today ? Math.max(0, Math.floor(Number(profile.earnedToday) || 0)) : 0;
}

export function remainingToday(profile, today = todaySeed()) {
  return Math.max(0, DAILY_CREDIT_CAP - earnedToday(profile, today));
}

/* Grant credits, clamped to the daily cap. Returns how many were actually
   granted (0 when the cap is already reached) so callers can message the player
   and record stats accurately. Mutates `profile`. */
export function earnCredits(profile, amount, today = todaySeed()) {
  const already = earnedToday(profile, today);
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  const granted = Math.min(requested, DAILY_CREDIT_CAP - already);
  profile.credits = Math.max(0, Math.floor(Number(profile.credits) || 0)) + granted;
  profile.earnDate = today;
  profile.earnedToday = already + granted;
  return granted;
}
