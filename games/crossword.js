/*
 * CUSTOMIZE MINI CROSSWORD HERE
 * - Edit CLUES and ANSWERS together; answers must stay uppercase and the same length.
 * - Add rows to both lists to make a longer crossword.
 * - render() controls the input layout and clue presentation.
 */
const CLUES = [
  'A crisp fruit often packed for a snack',
  'Small fruit that grows in a cluster',
  'A board game played with knights',
  'A stack of playing cards',
  'Reasoning that helps solve a puzzle'
];
const ANSWERS = ['APPLE', 'BERRY', 'CHESS', 'DECKS', 'LOGIC'];

export const metadata = {
  id: 'crossword',
  title: 'Mini crossword',
  kind: 'puzzles',
  subtitle: 'Five clues, five little wins',
  art: 'cross',
  description: 'Fill each short across answer from its clue.'
};

export function createState() {
  return { clues: [...CLUES], answers: [...ANSWERS], rows: ANSWERS.map(answer => Array(answer.length).fill('')), solved: [], finished: false };
}

export function render(state) {
  const rows = state.clues.map((clue, row) => `<p class="crossword-clue"><b>${row + 1}.</b><span>${clue}</span></p><div class="crossword-row ${state.solved.includes(row) ? 'is-solved' : ''}">${state.rows[row].map((letter, column) => `<input class="crossword-cell" inputmode="text" autocomplete="off" maxlength="1" data-cross-row="${row}" data-cross-col="${column}" aria-label="Answer ${row + 1}, letter ${column + 1}" value="${letter}" ${state.solved.includes(row) ? 'readonly' : ''}>`).join('')}</div>`).join('');
  return {
    board: `<div class="crossword">${rows}</div>`,
    aside: '<p class="aside-label">MINI CROSSWORD · ACROSS</p><h2 class="aside-title">Five clues, no rush</h2><p class="aside-copy">Type a letter in each square. Correct answers turn green; the next square gets focus automatically.</p><div class="reward-line"><span>Solve every clue</span><strong>+25 points<br>+50 XP</strong></div>'
  };
}

export function handleInput(target, state) {
  if (!target.matches('[data-cross-row]')) return null;
  const row = Number(target.dataset.crossRow);
  const column = Number(target.dataset.crossCol);
  const value = target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(-1);
  target.value = value;
  state.rows[row][column] = value;
  if (value && column < state.rows[row].length - 1) {
    checkRow(state, row);
    return { changed: true, focus: { row, column: column + 1 } };
  }
  checkRow(state, row);
  return { changed: true };
}

function checkRow(state, row) {
  if (state.rows[row].join('') !== state.answers[row] || state.solved.includes(row)) return false;
  state.solved.push(row);
  if (state.solved.length === state.answers.length) state.finished = true;
  return true;
}

export default { metadata, createState, render, handleInput };