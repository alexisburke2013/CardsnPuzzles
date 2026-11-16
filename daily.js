/*
 * DAILY CHALLENGE
 * One canonical seeded board per calendar day, plus streak tracking. The seed is
 * the date string, so every player on the same day gets the same puzzle and the
 * same board can be rebuilt later.
 *
 * Pure module: no DOM, no storage. The hub owns when a daily is completed.
 */
import { todaySeed } from './rng.js';

export function dailySeed(gameId, date = new Date()) {
  return `daily:${gameId}:${todaySeed(date)}`;
}

export function normalizeDaily(daily = {}) {
  return {
    lastDate: daily.lastDate ?? null,
    streak: Math.max(0, Math.floor(Number(daily.streak) || 0)),
    bestStreak: Math.max(0, Math.floor(Number(daily.bestStreak) || 0)),
    completedDate: daily.completedDate ?? null
  };
}

export function isCompletedToday(daily, date = new Date()) {
  return daily.completedDate === todaySeed(date);
}

function dayBefore(date) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - 1);
  return todaySeed(copy);
}

/* Mark today's daily done. The streak grows when yesterday was also done,
   resets to 1 otherwise, and never double-counts the same day. Mutates `daily`. */
export function completeDaily(daily, date = new Date()) {
  const today = todaySeed(date);
  if (daily.completedDate === today) return daily.streak;
  daily.streak = daily.lastDate === dayBefore(date) ? daily.streak + 1 : 1;
  daily.lastDate = today;
  daily.completedDate = today;
  daily.bestStreak = Math.max(daily.bestStreak ?? 0, daily.streak);
  return daily.streak;
}

/* A streak is only "alive" if the last completed day was today or yesterday. */
export function currentStreak(daily, date = new Date()) {
  if (!daily?.lastDate) return 0;
  const today = todaySeed(date);
  return daily.lastDate === today || daily.lastDate === dayBefore(date) ? daily.streak : 0;
}
