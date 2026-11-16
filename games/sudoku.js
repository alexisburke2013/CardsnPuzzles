/*
 * CUSTOMIZE SUDOKU HERE
 * - Difficulty levels and clue counts live in ./sudoku-generator.js.
 * - Edit render() to change the board controls or clues.
 * - Keep the module's state and event handlers together when adding features.
 * Boards come from the seeded generator, so passing the same seed rebuilds the
 * exact same puzzle (used by the daily challenge and by tests).
 */
import { HINT_COST, hintButton } from './hints.js';
import { generatePuzzle } from './sudoku-generator.js';

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

export const metadata = {
  id: 'sudoku',
  title: 'Sudoku',
  kind: 'puzzles',
  subtitle: 'A little number logic',
  art: 'sudoku',
  description: 'Fill every row, column, and 3 × 3 box with the numbers 1 through 9.'
};

export function createState({ difficulty = 'medium', seed } = {}) {
  const level = DIFFICULTIES.includes(difficulty) ? difficulty : 'medium';
  const { puzzle, solution } = generatePuzzle(level, seed);
  const firstEmpty = puzzle.indexOf(0);
  return {
    difficulty: level,
    seed: seed ?? null,
    givens: [...puzzle],
    cells: [...puzzle],
    solution,
    notes: Array.from({ length: 81 }, () => []),
    selected: firstEmpty < 0 ? null : firstEmpty,
    noteMode: false,
    mistakes: 0,
    hintsUsed: 0,
    finished: false
  };
}

function hasConflict(cells, index, value) {
  const row = Math.floor(index / 9);
  const column = index % 9;
  for (let offset = 0; offset < 9; offset++) {
    if (offset !== column && cells[row * 9 + offset] === value) return true;
    if (offset !== row && cells[offset * 9 + column] === value) return true;
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  for (let boxY = boxRow; boxY < boxRow + 3; boxY++) {
    for (let boxX = boxColumn; boxX < boxColumn + 3; boxX++) {
      const boxIndex = boxY * 9 + boxX;
      if (boxIndex !== index && cells[boxIndex] === value) return true;
    }
  }
  return false;
}

function isSolved(state) {
  return state.cells.every((value, index) => value === state.solution[index]);
}

function findNextEmpty(state, afterIndex) {
  for (let offset = 1; offset <= 81; offset++) {
    const index = (afterIndex + offset) % 81;
    if (!state.givens[index] && !state.cells[index]) return index;
  }
  return afterIndex;
}

export function render(state, { credits = 0 } = {}) {
  const selectedValue = state.selected !== null ? state.cells[state.selected] : 0;
  const cells = state.cells.map((value, index) => {
    const row = Math.floor(index / 9);
    const column = index % 9;
    const fixed = Boolean(state.givens[index]);
    const related = state.selected !== null && (
      Math.floor(state.selected / 9) === row ||
      state.selected % 9 === column ||
      (Math.floor(Math.floor(state.selected / 9) / 3) === Math.floor(row / 3) &&
        Math.floor((state.selected % 9) / 3) === Math.floor(column / 3))
    );
    const sameNumber = value && value === selectedValue;
    const invalid = value && hasConflict(state.cells, index, value);
    const common = `sudoku-cell ${fixed ? 'is-fixed' : ''} ${state.selected === index ? 'is-selected' : related ? 'is-related' : ''} ${sameNumber ? 'is-same' : ''} ${invalid ? 'is-wrong' : ''}`;
    const label = `Row ${row + 1}, column ${column + 1}${value ? `, ${value}` : ''}`;
    const notes = !value && state.notes[index].length
      ? `<span class="sudoku-notes" aria-hidden="true">${state.notes[index].map(note => `<i>${note}</i>`).join('')}</span>`
      : '';
    const content = fixed
      ? `${value}`
      : `<input class="sudoku-input" data-cell="${index}" aria-label="${label}" inputmode="numeric" pattern="[1-9]" autocomplete="off" maxlength="1" value="${value || ''}">${notes}`;
    return `<div class="${common}" data-cell-index="${index}" role="gridcell">${content}</div>`;
  }).join('');

  const pad = Array.from({ length: 9 }, (_, index) => `<button data-number="${index + 1}" aria-label="Enter ${index + 1}">${index + 1}</button>`).join('');
  const difficulty = `<label class="difficulty-control"><span>Difficulty</span><select data-sudoku-difficulty aria-label="Sudoku difficulty">${DIFFICULTIES.map(level => `<option value="${level}" ${state.difficulty === level ? 'selected' : ''}>${level[0].toUpperCase()}${level.slice(1)}</option>`).join('')}</select></label>`;

  return {
    board: `<div class="sudoku-controls"><div class="sudoku-board" role="group" aria-label="Sudoku board">${cells}</div><div class="number-pad" aria-label="Choose a number">${pad}<button data-number="0" aria-label="Erase selected cell">⌫</button><button class="note-toggle ${state.noteMode ? 'is-active' : ''}" data-note-toggle aria-pressed="${state.noteMode}" aria-label="Toggle pencil notes">✎ Notes</button></div></div>`,
    aside: `<p class="aside-label">SUDOKU · ${state.difficulty.toUpperCase()} · ${state.mistakes} MISTAKES</p><h2 class="aside-title">Find your next number</h2><p class="aside-copy">Type into any empty square, or choose one and tap a number. Turn on Notes to pencil in candidates. Matching numbers highlight together.</p>${difficulty}${hintButton('Reveal one square', { credits, finished: state.finished })}<div class="reward-line"><span>Solve the board</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

/* Apply a digit (or erase with 0) to a cell, honoring note mode. Returns a
   handler result so the hub knows whether to record an undo step. */
function place(state, index, value) {
  if (index === null || state.givens[index]) return { changed: false };
  if (state.noteMode && value) {
    const notes = state.notes[index];
    state.notes[index] = notes.includes(value) ? notes.filter(note => note !== value) : [...notes, value].sort();
    return { changed: true, undoable: true, focus: index };
  }
  state.notes[index] = [];
  state.cells[index] = value;
  if (value && value !== state.solution[index]) state.mistakes += 1;
  const focus = value ? findNextEmpty(state, index) : index;
  state.selected = focus;
  return { changed: true, undoable: true, solved: isSolved(state), focus };
}

export function handleClick(target, state, helpers) {
  if (target.closest('[data-game-hint]')) {
    const index = state.selected !== null && state.cells[state.selected] !== state.solution[state.selected]
      ? state.selected
      : state.cells.findIndex((value, cell) => value !== state.solution[cell]);
    if (index < 0) { helpers.toast('Every square is already correct.'); return true; }
    if (!helpers.spendCredits(HINT_COST)) return true;
    state.cells[index] = state.solution[index];
    state.notes[index] = [];
    state.hintsUsed += 1;
    state.selected = findNextEmpty(state, index);
    return { changed: true, undoable: true, solved: isSolved(state), focus: state.selected };
  }
  if (target.closest('[data-note-toggle]')) {
    state.noteMode = !state.noteMode;
    return true;
  }
  const numberButton = target.closest('[data-number]');
  if (numberButton) {
    if (state.selected === null) return true;
    return place(state, state.selected, Number(numberButton.dataset.number));
  }
  const cell = target.closest('[data-cell-index]');
  if (cell) {
    state.selected = Number(cell.dataset.cellIndex);
    return true;
  }
  return false;
}

export function handleInput(target, state) {
  if (!target.matches('[data-cell]')) return null;
  const index = Number(target.dataset.cell);
  const value = Number(target.value.replace(/[^1-9]/g, '').slice(-1));
  return place(state, index, value || 0);
}

export function handleKeyDown(event, state) {
  const cell = event.target.closest?.('[data-cell]');
  if (!cell) return null;
  const index = Number(cell.dataset.cell);
  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (!moves[event.key]) return null;
  event.preventDefault();
  const step = moves[event.key];
  let next = index + step;
  while (next >= 0 && next <= 80 && state.givens[next] && (Math.abs(step) === 9 || Math.floor(next / 9) === Math.floor(index / 9))) next += step;
  if (next < 0 || next > 80 || (Math.abs(step) === 1 && Math.floor(next / 9) !== Math.floor(index / 9))) return { changed: false };
  state.selected = next;
  return { changed: true, focus: next };
}

export function checkSolved(state) {
  return isSolved(state);
}

export default { metadata, createState, render, handleClick, handleInput, handleKeyDown, checkSolved };
