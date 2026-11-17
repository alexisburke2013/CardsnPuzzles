/*
 * ACHIEVEMENTS
 * Pure badge rules. Each achievement declares a `check(context)` predicate over
 * the player's profile, stats, daily streak, and level. The hub calls
 * `evaluate()` after a game is recorded and stores the unlocked ids on the
 * profile, so unlocking is idempotent and needs no per-achievement state.
 *
 * Keep this module free of DOM and storage: it is the sort of thing that should
 * sync cleanly through the store seam later.
 */

export const ACHIEVEMENTS = [
  { id: 'first-win', title: 'First Win', description: 'Complete any game.', check: context => context.profile.completed.length >= 1 },
  { id: 'collector', title: 'Collector', description: 'Complete every game on the shelf.', check: context => context.playableGames.every(id => context.profile.completed.includes(id)) },
  { id: 'streak-3', title: 'Warming Up', description: 'Reach a 3-day daily streak.', check: context => context.streak >= 3 },
  { id: 'streak-7', title: 'Week of Play', description: 'Reach a 7-day daily streak.', check: context => context.streak >= 7 },
  { id: 'level-5', title: 'Rising Star', description: 'Reach Level 5.', check: context => context.level >= 5 },
  { id: 'level-10', title: 'Seasoned Player', description: 'Reach Level 10.', check: context => context.level >= 10 },
  { id: 'marathon', title: 'Marathon', description: 'Finish 25 games.', check: context => context.totalPlayed >= 25 },
  { id: 'no-hints', title: 'Puzzle Purist', description: 'Win a game without spending a hint.', check: context => context.lastWin?.hints === 0 },
  { id: 'speedrun', title: 'Against the Clock', description: 'Win a game in under a minute.', check: context => Number.isFinite(context.lastWin?.time) && context.lastWin.time > 0 && context.lastWin.time < 60 },
  { id: 'triple-streak', title: 'On a Roll', description: 'Win three games of the same type in a row.', check: context => Object.values(context.stats).some(entry => entry.bestStreak >= 3) }
];

/* Ids that are unlocked for the given context but not yet recorded. */
export function evaluate(context) {
  const unlocked = context.profile.achievements ?? [];
  return ACHIEVEMENTS.filter(achievement => !unlocked.includes(achievement.id) && achievement.check(context)).map(achievement => achievement.id);
}

export function byId(id) {
  return ACHIEVEMENTS.find(achievement => achievement.id === id) ?? null;
}

export function totalPlayed(stats = {}) {
  return Object.values(stats).reduce((sum, entry) => sum + (entry.played || 0), 0);
}

export default { ACHIEVEMENTS, evaluate, byId, totalPlayed };
