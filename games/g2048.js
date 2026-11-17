/*
 * CUSTOMIZE 2048 HERE
 * - Change SIZE for a different board (4 is classic).
 * - Change TARGET to win at a different tile value.
 * - COLORS below drive the tile palette (kept in styles.css by class name).
 * The spawn is seeded, so a daily or shared board rebuilds exactly. Moves are
 * undoable; reaching TARGET marks the board solved and awards the reward.
 */
import { createRng } from '../rng.js';
import { HINT_COST, hintButton } from './hints.js';

export const SIZE = 4;
export const TARGET = 2048;

export const metadata = {
  id: 'g2048',
  title: '2048',
  kind: 'puzzles',
  subtitle: 'Merge the tiles',
  art: 'tiles',
  description: 'Slide the grid and merge matching tiles until one reaches 2048.'
};

function blankCells() {
  return Array.from({ length: SIZE * SIZE }, () => 0);
}

function emptyIndices(cells) {
  const result = [];
  cells.forEach((value, index) => { if (!value) result.push(index); });
  return result;
}

/* Add one tile: a 4 most of the time, a 2 sometimes, at a seeded empty cell. */
function spawn(cells, rng) {
  const empties = emptyIndices(cells);
  if (!empties.length) return;
  const index = rng.pick(empties);
  cells[index] = rng.next() < 0.9 ? 2 : 4;
}

export function createState({ seed } = {}) {
  const rng = createRng(seed);
  const cells = blankCells();
  spawn(cells, rng);
  spawn(cells, rng);
  return {
    cells,
    score: 0,
    best: 0,
    won: false,
    keepPlaying: false,
    finished: false,
    rewarded: false,
    moves: 0,
    seed: seed ?? null
  };
}

function lineIndices(direction) {
  const lines = [];
  for (let index = 0; index < SIZE; index++) {
    const line = [];
    for (let offset = 0; offset < SIZE; offset++) {
      if (direction === 'left') line.push(index * SIZE + offset);
      else if (direction === 'right') line.push(index * SIZE + (SIZE - 1 - offset));
      else if (direction === 'up') line.push(offset * SIZE + index);
      else line.push((SIZE - 1 - offset) * SIZE + index);
    }
    lines.push(line);
  }
  return lines;
}

/* Slide one line toward its head: compact, merge equal neighbours once, compact. */
function slideLine(values) {
  const compact = values.filter(Boolean);
  const merged = [];
  let gained = 0;
  for (let index = 0; index < compact.length; index++) {
    if (compact[index] === compact[index + 1]) {
      const value = compact[index] * 2;
      merged.push(value);
      gained += value;
      index += 1;
    } else {
      merged.push(compact[index]);
    }
  }
  while (merged.length < SIZE) merged.push(0);
  return { merged, gained };
}

export function move(state, direction) {
  const lines = lineIndices(direction);
  let changed = false;
  let gained = 0;
  for (const line of lines) {
    const before = line.map(index => state.cells[index]);
    const { merged, gained: lineGain } = slideLine(before);
    gained += lineGain;
    line.forEach((index, offset) => {
      if (state.cells[index] !== merged[offset]) changed = true;
      state.cells[index] = merged[offset];
    });
  }
  if (!changed) return false;
  state.score += gained;
  state.best = Math.max(state.best, state.score);
  state.moves += 1;
  if (!state.won && state.cells.some(value => value >= TARGET)) state.won = true;
  const rng = createRng(state.seed ? `${state.seed}:${state.moves}` : undefined);
  spawn(state.cells, rng);
  if (!hasMoves(state)) state.finished = true;
  return true;
}

export function hasMoves(state) {
  if (emptyIndices(state.cells).length) return true;
  for (let row = 0; row < SIZE; row++) {
    for (let column = 0; column < SIZE; column++) {
      const value = state.cells[row * SIZE + column];
      if (column + 1 < SIZE && state.cells[row * SIZE + column + 1] === value) return true;
      if (row + 1 < SIZE && state.cells[(row + 1) * SIZE + column] === value) return true;
    }
  }
  return false;
}

/* Suggest the direction with the best immediate outcome (most merges, then most
   empty cells). Used by the hint button; it never mutates the real board. */
export function bestMove(state) {
  let best = null;
  let bestScore = -1;
  for (const direction of ['up', 'left', 'down', 'right']) {
    const clone = { ...state, cells: [...state.cells], score: state.score, moves: state.moves, seed: null };
    const moved = move(clone, direction);
    if (!moved) continue;
    const merges = clone.score - state.score;
    const empties = emptyIndices(clone.cells).length;
    const score = merges * 10 + empties;
    if (score > bestScore) { bestScore = score; best = direction; }
  }
  return best;
}

const PALETTE = { 2: 't2', 4: 't4', 8: 't8', 16: 't16', 32: 't32', 64: 't64', 128: 't128', 256: 't256', 512: 't512', 1024: 't1024', 2048: 't2048' };

export function render(state, { credits = 0 } = {}) {
  const tiles = state.cells.map((value, index) => {
    const tone = value ? PALETTE[value] ?? 'tbig' : 'empty';
    return `<div class="tile ${tone}" data-tile="${index}" aria-label="${value || 'empty'}">${value || ''}</div>`;
  }).join('');
  const pad = ['up', 'left', 'down', 'right'].map(direction => `<button class="pad-button" data-2048-move="${direction}" aria-label="Slide ${direction}">${{ up: '▲', down: '▼', left: '◀', right: '▶' }[direction]}</button>`).join('');
  const banner = state.won && !state.keepPlaying
    ? '<p class="game-banner is-win">You reached 2048! Keep going for a higher score or start fresh.</p>'
    : state.finished
      ? '<p class="game-banner is-stuck">No moves left. Start a new game to try again.</p>'
      : '';
  return {
    board: `<div class="board-2048">${tiles}</div><div class="pad-2048" aria-label="Slide the board">${pad}</div>`,
    aside: `${banner}<p class="aside-label">2048 · ${state.moves} MOVES</p><h2 class="aside-title">Merge to the top</h2><p class="aside-copy">Swipe the board, use the arrow keys, or tap the arrows to slide every tile. Equal tiles that collide merge into their sum. Reach ${TARGET} to win.</p><div class="score-line"><span>Score</span><strong>${state.score}</strong><span>Best</span><strong>${state.best}</strong></div>${hintButton('Suggest a move', { credits, finished: state.finished })}<button class="game-action" data-2048-continue ${state.won && !state.keepPlaying ? '' : 'hidden'}>Keep playing</button><div class="reward-line"><span>Reach ${TARGET}</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

export function handleClick(target, state, helpers) {
  if (target.closest('[data-game-hint]')) {
    if (!helpers.spendCredits(HINT_COST)) return true;
    const suggestion = bestMove(state);
    helpers.toast(suggestion ? `Try sliding ${suggestion}.` : 'No move will change the board.');
    state.hint = suggestion;
    return true;
  }
  const moveButton = target.closest('[data-2048-move]');
  if (moveButton) return applyMove(state, moveButton.dataset['2048Move'] ?? moveButton.dataset['2048move']);
  if (target.closest('[data-2048-continue]')) {
    state.keepPlaying = true;
    return true;
  }
  return false;
}

function applyMove(state, direction) {
  if (!direction || state.finished || (state.won && !state.keepPlaying)) return true;
  const moved = move(state, direction);
  if (!moved) return true;
  return { changed: true, undoable: true, solved: state.won && !state.rewarded ? true : undefined };
}

export function handleKeyDown(event, state) {
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  const direction = map[event.key];
  if (!direction) return null;
  event.preventDefault();
  return applyMove(state, direction);
}

/* Swipe the board on touch. We remember where the finger went down and resolve
   the direction on release, which keeps taps on the arrow pad unaffected. */
export function handlePointerDown(event, state) {
  if (!event.target.closest?.('.board-2048')) return;
  state.swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
}

export function handlePointerUp(event, state) {
  const swipe = state.swipe;
  if (!swipe || swipe.id !== event.pointerId) return false;
  state.swipe = null;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  if (Math.hypot(dx, dy) < 24) return true;
  const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  return applyMove(state, direction);
}

export function handlePointerCancel(event, state) {
  if (state.swipe && state.swipe.id === event.pointerId) state.swipe = null;
}

export function checkSolved(state) {
  return Boolean(state.won && !state.rewarded);
}

export default { metadata, createState, render, handleClick, handleKeyDown, handlePointerDown, handlePointerUp, handlePointerCancel, checkSolved, move, hasMoves, bestMove };
