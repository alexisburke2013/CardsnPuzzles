/*
 * CUSTOMIZE CROSSWORD HERE
 * - Edit ./crossword-data.js: GRID holds the letters and blocks, ENTRIES holds
 *   the clues. Crossing letters are shared because the grid is the source of
 *   truth, so an across and a down answer that overlap stay in sync.
 * - render() controls the input layout and clue presentation.
 */
import { HINT_COST, hintButton } from './hints.js';
import { GRID, ENTRIES, BLOCK } from './crossword-data.js';

export const metadata = {
  id: 'crossword',
  title: 'Mini crossword',
  kind: 'puzzles',
  subtitle: 'Across and down, woven together',
  art: 'cross',
  description: 'Fill the grid from the across and down clues. Crossing answers share letters.'
};

function cellsFor(entry) {
  return Array.from({ length: entry.answer.length }, (_, offset) => ({
    row: entry.row + (entry.direction === 'down' ? offset : 0),
    column: entry.column + (entry.direction === 'across' ? offset : 0)
  }));
}

export function createState() {
  const solution = GRID.map(row => [...row]);
  const entries = ENTRIES.map(entry => ({ ...entry, cells: cellsFor(entry) }));
  return {
    solution,
    entries,
    letters: solution.map(row => row.map(cell => (cell === BLOCK ? BLOCK : ''))),
    solved: [],
    selected: null,
    finished: false
  };
}

function entrySolved(state, entry) {
  return entry.cells.every(({ row, column }) => state.letters[row][column] === state.solution[row][column]);
}

function markSolved(state) {
  let changed = false;
  state.entries.forEach(entry => {
    const key = `${entry.number}-${entry.direction}`;
    if (!state.solved.includes(key) && entrySolved(state, entry)) { state.solved.push(key); changed = true; }
  });
  if (state.solved.length === state.entries.length) state.finished = true;
  return changed;
}

export function render(state, { credits = 0 } = {}) {
  const selected = state.selected;
  const activeKeys = new Set();
  if (selected) {
    state.entries.forEach(entry => {
      if (entry.cells.some(cell => cell.row === selected.row && cell.column === selected.column)) activeKeys.add(`${entry.number}-${entry.direction}`);
    });
  }
  const grid = state.solution.map((row, rowIndex) => row.map((cell, columnIndex) => {
    if (cell === BLOCK) return '<span class="crossword-block" aria-hidden="true"></span>';
    const value = state.letters[rowIndex][columnIndex];
    const isSelected = selected && selected.row === rowIndex && selected.column === columnIndex;
    const inActive = state.entries.some(entry => activeKeys.has(`${entry.number}-${entry.direction}`) &&
      entry.cells.some(c => c.row === rowIndex && c.column === columnIndex));
    const solved = state.entries.some(entry => state.solved.includes(`${entry.number}-${entry.direction}`) &&
      entry.cells.some(c => c.row === rowIndex && c.column === columnIndex));
    return `<input class="crossword-cell ${isSelected ? 'is-selected' : ''} ${inActive ? 'is-related' : ''} ${solved ? 'is-solved' : ''}" inputmode="text" autocomplete="off" maxlength="1" data-cross-row="${rowIndex}" data-cross-col="${columnIndex}" aria-label="Row ${rowIndex + 1}, column ${columnIndex + 1}" value="${value}">`;
  }).join('')).join('');

  const clues = ['across', 'down'].map(direction => {
    const list = state.entries.filter(entry => entry.direction === direction).map(entry => {
      const done = state.solved.includes(`${entry.number}-${entry.direction}`);
      return `<button class="crossword-clue ${done ? 'is-solved' : ''}" data-cross-clue="${entry.number}-${entry.direction}"><b>${entry.number}</b><span>${entry.clue}</span></button>`;
    }).join('');
    return `<div class="crossword-clue-group"><h3 class="crossword-clue-heading">${direction === 'across' ? 'Across' : 'Down'}</h3>${list}</div>`;
  }).join('');

  return {
    board: `<div class="crossword"><div class="crossword-grid" style="--cross-size:${state.solution.length}" role="group" aria-label="Crossword grid">${grid}</div><div class="crossword-clues">${clues}</div></div>`,
    aside: `<p class="aside-label">MINI CROSSWORD · ${state.solved.length}/${state.entries.length} SOLVED</p><h2 class="aside-title">Across and down</h2><p class="aside-copy">Type a letter in each square. Tap a clue to jump to it. Crossing answers share letters, so every word helps its neighbours.</p>${hintButton('Reveal one letter', { credits, finished: state.finished })}<div class="reward-line"><span>Solve every clue</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

export function handleClick(target, state, helpers) {
  const clue = target.closest('[data-cross-clue]');
  if (clue) {
    const entry = state.entries.find(item => `${item.number}-${item.direction}` === clue.dataset.crossClue);
    if (entry) state.selected = { row: entry.cells[0].row, column: entry.cells[0].column };
    return { changed: true, undoable: false, focus: state.selected };
  }
  const input = target.closest('[data-cross-row]');
  if (input) {
    // No rerender here: replacing the input would blur it and drop the caret.
    state.selected = { row: Number(input.dataset.crossRow), column: Number(input.dataset.crossCol) };
    return { changed: false };
  }
  if (!target.closest('[data-game-hint]')) return false;
  const focusEntry = state.selected
    ? state.entries.find(entry => entry.cells.some(cell => cell.row === state.selected.row && cell.column === state.selected.column) && !state.solved.includes(`${entry.number}-${entry.direction}`))
    : null;
  const entry = focusEntry ?? state.entries.find(item => !state.solved.includes(`${item.number}-${item.direction}`));
  if (!entry) { helpers.toast('Every clue is already solved.'); return true; }
  const startIndex = state.selected ? Math.max(0, entry.cells.findIndex(cell => cell.row === state.selected.row && cell.column === state.selected.column)) : 0;
  let index = -1;
  for (let offset = 0; offset < entry.cells.length; offset++) {
    const candidate = (startIndex + offset) % entry.cells.length;
    const { row, column } = entry.cells[candidate];
    if (state.letters[row][column] !== state.solution[row][column]) { index = candidate; break; }
  }
  if (index < 0) { helpers.toast('That answer has no letters left to reveal.'); return true; }
  if (!helpers.spendCredits(HINT_COST)) return true;
  const { row, column } = entry.cells[index];
  state.letters[row][column] = state.solution[row][column];
  state.selected = { row, column };
  markSolved(state);
  return { changed: true, undoable: true, focus: state.selected, solved: state.finished };
}

export function handleInput(target, state) {
  if (!target.matches('[data-cross-row]')) return null;
  const row = Number(target.dataset.crossRow);
  const column = Number(target.dataset.crossCol);
  const value = target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(-1);
  target.value = value;
  state.letters[row][column] = value;
  state.selected = { row, column };
  markSolved(state);
  return { changed: true, undoable: true, focus: nextCell(state, row, column), solved: state.finished };
}

/* Advance to the next empty square of the active entry, else the next square in
   reading order. Keeps typing flowing without leaving the current word. */
function nextCell(state, row, column) {
  const entry = state.entries.find(item => item.cells.some(cell => cell.row === row && cell.column === column));
  if (entry) {
    const index = entry.cells.findIndex(cell => cell.row === row && cell.column === column);
    for (let offset = 1; offset < entry.cells.length; offset++) {
      const cell = entry.cells[(index + offset) % entry.cells.length];
      if (!state.letters[cell.row][cell.column]) return cell;
    }
  }
  for (let index = 0; index < state.solution.length; index++) {
    for (let cursor = 0; cursor < state.solution[index].length; cursor++) {
      if (state.solution[index][cursor] === BLOCK) continue;
      if (index > row || (index === row && cursor > column)) return { row: index, column: cursor };
    }
  }
  return { row, column };
}

export function handleKeyDown(event, state) {
  const input = event.target.closest?.('[data-cross-row]');
  if (!input) return null;
  const row = Number(input.dataset.crossRow);
  const column = Number(input.dataset.crossCol);
  const entry = state.entries.find(item => item.cells.some(cell => cell.row === row && cell.column === column));
  if (!entry) return null;
  const index = entry.cells.findIndex(cell => cell.row === row && cell.column === column);
  const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
  if (!back && !forward) return null;
  event.preventDefault();
  const next = entry.cells[(index + (forward ? 1 : -1) + entry.cells.length) % entry.cells.length];
  state.selected = next;
  return { changed: true, focus: next };
}

export default { metadata, createState, render, handleClick, handleInput, handleKeyDown };
