/*
 * SEEDED RANDOM
 * Deterministic RNG for reproducible boards. Every game that generates a
 * layout should take a seed so a daily challenge, a shared board link, or a
 * saved game can be rebuilt exactly. Falls back to Math.random when no seed
 * is given, which keeps casual play varied.
 *
 * Use mulberry32: small, fast, and good enough for shuffling game boards.
 */

function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  const hasSeed = seed !== undefined && seed !== null && seed !== '';
  let state = hashSeed(hasSeed ? seed : Math.floor(Math.random() * 2 ** 32));
  const next = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seeded: hasSeed,
    next,
    int(maxExclusive) { return Math.floor(next() * maxExclusive); },
    pick(items) { return items[Math.floor(next() * items.length)]; },
    shuffle(items) {
      const result = [...items];
      for (let index = result.length - 1; index > 0; index--) {
        const swap = Math.floor(next() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
      }
      return result;
    }
  };
}

export function todaySeed(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
