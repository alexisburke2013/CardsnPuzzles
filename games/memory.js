/*
 * CUSTOMIZE MEMORY HERE
 * - Change DIFFICULTIES for different board sizes (pairs of cards).
 * - Change FACES for a different symbol set; every symbol is duplicated so the
 *   board always has matched pairs.
 * The shuffle is seeded, so a daily or shared board rebuilds exactly. Flipping
 * two cards is one undoable move; mismatches flip back after a short delay.
 */
import { createRng } from '../rng.js';
import { HINT_COST, hintButton } from './hints.js';

export const DIFFICULTIES = {
  easy: { pairs: 6, label: 'Easy' },
  medium: { pairs: 8, label: 'Medium' },
  hard: { pairs: 10, label: 'Hard' }
};

export const FACES = ['♥', '♠', '♦', '♣', '★', '◆', '●', '▲', '✿', '☀', '☾', '♬'];

export const metadata = {
  id: 'memory',
  title: 'Memory',
  kind: 'cards',
  subtitle: 'Match the pairs',
  art: 'cards',
  description: 'Flip two cards at a time and remember where each symbol hides.'
};

export function createState({ difficulty = 'medium', seed } = {}) {
  const level = DIFFICULTIES[difficulty] ? difficulty : 'medium';
  const pairs = DIFFICULTIES[level].pairs;
  const rng = createRng(seed);
  const faces = rng.shuffle(FACES).slice(0, pairs);
  const deck = rng.shuffle([...faces, ...faces]).map((face, index) => ({ index, face, matched: false }));
  return {
    difficulty: level,
    seed: seed ?? null,
    deck,
    flipped: [],
    matched: 0,
    pairs,
    moves: 0,
    lock: false,
    finished: false,
    rewarded: false
  };
}

export function isSolved(state) {
  return state.matched === state.pairs;
}

export function render(state, { credits = 0 } = {}) {
  const columns = state.pairs <= 6 ? 4 : 5;
  const cards = state.deck.map((card, index) => {
    const revealed = card.matched || state.flipped.includes(index) || state.hint?.includes(index);
    const label = revealed ? `Card ${card.face}` : 'Face-down card';
    return `<button class="memory-card ${revealed ? 'is-revealed' : ''} ${card.matched ? 'is-matched' : ''} ${state.hint?.includes(index) ? 'is-hinted' : ''}" data-memory="${index}" aria-label="${label}" ${card.matched ? 'disabled' : ''}>${revealed ? card.face : '✳'}</button>`;
  }).join('');
  const difficulty = `<label class="difficulty-control"><span>Difficulty</span><select data-memory-difficulty aria-label="Memory difficulty">${Object.entries(DIFFICULTIES).map(([id, item]) => `<option value="${id}" ${state.difficulty === id ? 'selected' : ''}>${item.label} · ${item.pairs} pairs</option>`).join('')}</select></label>`;
  const banner = state.finished ? '<p class="game-banner is-win">All pairs found. Sharp memory.</p>' : '';
  return {
    board: `<div class="memory-board" style="--memory-columns:${columns}">${cards}</div>`,
    aside: `${banner}<p class="aside-label">MEMORY · ${DIFFICULTIES[state.difficulty].label.toUpperCase()} · ${state.moves} MOVES</p><h2 class="aside-title">Remember the symbols</h2><p class="aside-copy">Tap a card to turn it over, then tap a second. A matching pair stays face up; anything else flips back. Fewer moves means a better game.</p>${difficulty}${hintButton('Reveal a pair', { credits, finished: state.finished })}<div class="reward-line"><span>Find every pair</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

/* A pair still hidden: two face-down cards sharing a face. Used by the hint. */
function findHintPair(state) {
  const byFace = {};
  state.deck.forEach((card, index) => {
    if (card.matched) return;
    (byFace[card.face] ??= []).push(index);
  });
  const pair = Object.values(byFace).find(indices => indices.length >= 2);
  return pair ? pair.slice(0, 2) : null;
}

export function handleClick(target, state, helpers) {
  if (target.closest('[data-game-hint]')) {
    const pair = findHintPair(state);
    if (!pair) { helpers.toast('Every pair is already matched.'); return true; }
    if (!helpers.spendCredits(HINT_COST)) return true;
    state.hint = pair;
    helpers.toast('These two cards match.');
    return { changed: true };
  }
  const card = target.closest('[data-memory]');
  if (!card) return false;
  if (state.lock || state.finished) return true;
  const index = Number(card.dataset.memory);
  if (state.deck[index].matched || state.flipped.includes(index)) return true;
  state.hint = null;
  state.flipped.push(index);
  if (state.flipped.length < 2) return { changed: true, focus: null };
  state.moves += 1;
  const [first, second] = state.flipped;
  if (state.deck[first].face === state.deck[second].face) {
    state.deck[first].matched = true;
    state.deck[second].matched = true;
    state.matched += 1;
    state.flipped = [];
    if (isSolved(state)) state.finished = true;
    return { changed: true, undoable: true, solved: state.finished && !state.rewarded };
  }
  // Keep the mismatched pair visible briefly, then clear it.
  state.lock = true;
  const pair = [...state.flipped];
  setTimeout(() => {
    if (state.flipped.join(',') === pair.join(',')) state.flipped = [];
    state.lock = false;
    helpers?.rerender?.();
  }, 750);
  return { changed: true, undoable: true };
}

export function checkSolved(state) {
  return Boolean(state.finished && !state.rewarded);
}

export default { metadata, createState, render, handleClick, checkSolved };
