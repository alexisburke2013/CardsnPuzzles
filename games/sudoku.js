/*
 * CUSTOMIZE SUDOKU HERE
 * - Change PUZZLE and SOLUTION together to ship a different starter board.
 * - Edit render() to change the board controls or clues.
 * - Keep the module's state and event handlers together when adding pencil marks or difficulty.
 */
const PUZZLE = '100400009050080120009100406030507090500801004090030500305070010070902040900040078';
const SOLUTION = '123456789456789123789123456234567891567891234891234567345678912678912345912345678';

export const metadata = {
  id: 'sudoku',
  title: 'Sudoku',
  kind: 'puzzles',
  subtitle: 'A little number logic',
  art: 'sudoku',
  description: 'Fill every row, column, and 3 × 3 box with the numbers 1 through 9.'
};

export function createState() {
  return {
    givens: [...PUZZLE].map(Number),
    cells: [...PUZZLE].map(Number),
    solution: [...SOLUTION].map(Number),
    selected: PUZZLE.indexOf('0'),
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

export function render(state) {
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
    const invalid = value && hasConflict(state.cells, index, value);
    const common = `sudoku-cell ${fixed ? 'is-fixed' : ''} ${state.selected === index ? 'is-selected' : related ? 'is-related' : ''} ${invalid ? 'is-wrong' : ''}`;
    if (fixed) return `<span class="${common}" aria-label="Row ${row + 1}, column ${column + 1}, ${value}">${value}</span>`;
    return `<input class="${common}" data-cell="${index}" aria-label="Row ${row + 1}, column ${column + 1}" inputmode="numeric" pattern="[1-9]" autocomplete="off" maxlength="1" value="${value || ''}">`;
  }).join('');

  return {
    board: `<div class="sudoku-controls"><div class="sudoku-board" role="group" aria-label="Sudoku board">${cells}</div><div class="number-pad" aria-label="Choose a number">${Array.from({ length: 9 }, (_, index) => `<button data-number="${index + 1}" aria-label="Enter ${index + 1}">${index + 1}</button>`).join('')}<button data-number="0" aria-label="Erase selected cell">⌫</button></div></div>`,
    aside: '<p class="aside-label">A SMALL TIP</p><h2 class="aside-title">Find your next number</h2><p class="aside-copy">Type straight into any empty square, or choose one and tap a number. Arrow keys move between squares; Backspace clears a square.</p><div class="reward-line"><span>Solve the board</span><strong>+25 points<br>+50 XP</strong></div>'
  };
}

export function handleClick(target, state) {
  const numberButton = target.closest('[data-number]');
  if (numberButton) {
    if (state.selected !== null) return enterNumber(state, Number(numberButton.dataset.number), state.selected);
    return true;
  }
  const cell = target.closest('[data-cell]');
  if (cell) {
    state.selected = Number(cell.dataset.cell);
    return true;
  }
  return false;
}

export function handleInput(target, state) {
  if (!target.matches('[data-cell]')) return null;
  const index = Number(target.dataset.cell);
  const value = Number(target.value.replace(/[^1-9]/g, '').slice(-1));
  state.cells[index] = value || 0;
  const focus = value ? findNextEmpty(state, index) : index;
  state.selected = focus;
  return { changed: true, solved: isSolved(state), focus };
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

export function enterNumber(state, value, index = state.selected) {
  if (index === null || state.givens[index]) return true;
  state.cells[index] = value;
  state.selected = value ? findNextEmpty(state, index) : index;
  return true;
}

export function checkSolved(state) {
  return isSolved(state);
}

export default { metadata, createState, render, handleClick, handleInput, handleKeyDown, checkSolved };