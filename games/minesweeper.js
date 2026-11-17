/*
 * CUSTOMIZE MINESWEEPER HERE
 * - Change DIFFICULTIES for different board sizes and mine counts.
 * - Change NUMBER_COLORS in styles.css for the adjacent-count palette.
 * The board is safe on the first tap: mines are placed only after the first
 * reveal, and never under the tapped cell or its neighbours. Placement is
 * seeded, so a daily or shared board rebuilds exactly.
 */
import { createRng } from '../rng.js';
import { HINT_COST, hintButton } from './hints.js';

export const DIFFICULTIES = {
  easy: { rows: 8, columns: 8, mines: 10, label: 'Easy' },
  medium: { rows: 10, columns: 10, mines: 20, label: 'Medium' },
  hard: { rows: 12, columns: 12, mines: 30, label: 'Hard' }
};

export const metadata = {
  id: 'minesweeper',
  title: 'Minesweeper',
  kind: 'puzzles',
  subtitle: 'Clear the field',
  art: 'sudoku',
  description: 'Reveal every safe square. Numbers count the mines touching that square.'
};

function neighbours(index, rows, columns) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = column + dc;
      if (r >= 0 && r < rows && c >= 0 && c < columns) result.push(r * columns + c);
    }
  }
  return result;
}

export function createState({ difficulty = 'medium', seed } = {}) {
  const level = DIFFICULTIES[difficulty] ? difficulty : 'medium';
  const { rows, columns, mines } = DIFFICULTIES[level];
  return {
    difficulty: level,
    rows,
    columns,
    mines,
    cells: Array.from({ length: rows * columns }, () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 })),
    started: false,
    finished: false,
    won: false,
    revealed: 0,
    flags: 0,
    moves: 0,
    flagMode: false,
    seed: seed ?? null
  };
}

/* Place mines away from the first tap so the opening move is always safe. */
function placeMines(state, safeIndex) {
  const rng = createRng(state.seed);
  const safe = new Set([safeIndex, ...neighbours(safeIndex, state.rows, state.columns)]);
  const candidates = state.cells.map((_, index) => index).filter(index => !safe.has(index));
  for (const index of rng.shuffle(candidates).slice(0, state.mines)) {
    state.cells[index].mine = true;
  }
  state.cells.forEach((cell, index) => {
    if (cell.mine) return;
    cell.adjacent = neighbours(index, state.rows, state.columns).filter(n => state.cells[n].mine).length;
  });
  state.started = true;
}

function floodReveal(state, start) {
  const stack = [start];
  while (stack.length) {
    const index = stack.pop();
    const cell = state.cells[index];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    state.revealed += 1;
    if (cell.adjacent === 0) {
      for (const n of neighbours(index, state.rows, state.columns)) {
        if (!state.cells[n].revealed && !state.cells[n].flagged) stack.push(n);
      }
    }
  }
}

function checkWin(state) {
  if (state.revealed === state.rows * state.columns - state.mines) {
    state.finished = true;
    state.won = true;
    state.cells.forEach(cell => { if (cell.mine) cell.flagged = true; });
  }
}

function reveal(state, index) {
  const cell = state.cells[index];
  if (cell.revealed || cell.flagged || state.finished) return false;
  if (!state.started) placeMines(state, index);
  if (cell.mine) {
    cell.revealed = true;
    state.finished = true;
    state.won = false;
    return true;
  }
  floodReveal(state, index);
  checkWin(state);
  return true;
}

function toggleFlag(state, index) {
  const cell = state.cells[index];
  if (cell.revealed || state.finished) return false;
  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;
  return true;
}

/* A safe square the player can reveal next, preferring an already-opened frontier
   so the suggestion reads as progress. Used by the hint button. */
export function bestMove(state) {
  if (!state.started) return 0;
  const closed = state.cells.map((cell, index) => ({ cell, index })).filter(({ cell }) => !cell.revealed && !cell.flagged && !cell.mine);
  const frontier = closed.find(({ index }) => neighbours(index, state.rows, state.columns).some(n => state.cells[n].revealed));
  return (frontier ?? closed[0])?.index ?? null;
}

export function render(state, { credits = 0 } = {}) {
  const cells = state.cells.map((cell, index) => {
    const hint = state.hint === index;
    if (cell.revealed) {
      const tone = cell.mine ? 'is-mine' : cell.adjacent ? `n${cell.adjacent}` : '';
      return `<div class="mine-cell is-revealed ${tone}" aria-label="${cell.mine ? 'mine' : cell.adjacent || 'empty'}">${cell.mine ? '✱' : cell.adjacent || ''}</div>`;
    }
    return `<button class="mine-cell ${cell.flagged ? 'is-flagged' : ''} ${hint ? 'is-hinted' : ''}" data-mine="${index}" aria-label="Square ${index + 1}${cell.flagged ? ', flagged' : ', hidden'}" ${state.finished ? 'disabled' : ''}>${cell.flagged ? '⚑' : ''}</button>`;
  }).join('');
  const remaining = state.mines - state.flags;
  const difficulty = `<label class="difficulty-control"><span>Difficulty</span><select data-mine-difficulty aria-label="Minesweeper difficulty">${Object.entries(DIFFICULTIES).map(([id, item]) => `<option value="${id}" ${state.difficulty === id ? 'selected' : ''}>${item.label} · ${item.mines} mines</option>`).join('')}</select></label>`;
  const banner = state.won
    ? '<p class="game-banner is-win">Field cleared. Well swept.</p>'
    : state.finished
      ? '<p class="game-banner is-stuck">A mine went off. Start a new game to try again.</p>'
      : '';
  return {
    board: `<div class="mine-board" style="--mine-columns:${state.columns}">${cells}</div><div class="mine-tools"><button class="flag-toggle ${state.flagMode ? 'is-active' : ''}" data-mine-flag-toggle aria-pressed="${state.flagMode}">⚑ Flag mode</button><span class="mine-counter" aria-label="${remaining} mines remaining">⚑ ${remaining}</span></div>`,
    aside: `${banner}<p class="aside-label">MINESWEEPER · ${DIFFICULTIES[state.difficulty].label.toUpperCase()} · ${state.revealed} OPEN</p><h2 class="aside-title">Map the minefield</h2><p class="aside-copy">Tap a square to open it. Numbers count the mines next to that square. Turn on Flag mode to mark suspected mines, or long-press a square. Open every safe square to win.</p>${difficulty}${hintButton('Reveal a safe square', { credits, finished: state.finished })}<div class="reward-line"><span>Clear the field</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

export function handleClick(target, state, helpers) {
  if (target.closest('[data-game-hint]')) {
    if (!helpers.spendCredits(HINT_COST)) return true;
    const index = bestMove(state);
    state.hint = index;
    helpers.toast(index === null ? 'No safe square to suggest.' : `Square ${index + 1} is safe.`);
    return { changed: true };
  }
  if (target.closest('[data-mine-flag-toggle]')) {
    state.flagMode = !state.flagMode;
    return { changed: true };
  }
  const cell = target.closest('[data-mine]');
  if (!cell) return false;
  if (state.finished) return true;
  if (state.suppressClick) { state.suppressClick = false; return true; }
  const index = Number(cell.dataset.mine);
  state.hint = null;
  const changed = state.flagMode ? toggleFlag(state, index) : reveal(state, index);
  if (!changed) return true;
  state.moves += 1;
  return { changed: true, undoable: true, solved: state.won && !state.rewarded };
}

/* Long-press on touch toggles a flag without leaving Flag mode off. We swallow
   the click that follows so the same gesture does not also open the square. */
export function handlePointerDown(event, state) {
  if (!event.target.closest?.('[data-mine]') || state.finished) return;
  state.press = { id: event.pointerId, index: Number(event.target.closest('[data-mine]').dataset.mine), time: Date.now(), x: event.clientX, y: event.clientY };
}

export function handlePointerUp(event, state) {
  const press = state.press;
  if (!press || press.id !== event.pointerId) return false;
  state.press = null;
  const held = Date.now() - press.time;
  const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
  if (held >= 450 && moved < 12 && !state.cells[press.index].revealed) {
    toggleFlag(state, press.index);
    state.moves += 1;
    state.suppressClick = true;
    return { changed: true, undoable: true };
  }
  return false;
}

export function handlePointerCancel(event, state) {
  if (state.press?.id === event.pointerId) state.press = null;
}

export function handleContextMenu(event, state, helpers) {
  const cell = event.target.closest?.('[data-mine]');
  if (!cell || state.finished) return false;
  event.preventDefault();
  const index = Number(cell.dataset.mine);
  if (toggleFlag(state, index)) {
    state.moves += 1;
    return { changed: true, undoable: true };
  }
  return true;
}

export function checkSolved(state) {
  return Boolean(state.won && !state.rewarded);
}

export default { metadata, createState, render, handleClick, handlePointerDown, handlePointerUp, handlePointerCancel, handleContextMenu, checkSolved, bestMove };
