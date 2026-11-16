/*
 * CUSTOMIZE TIC TAC TOE HERE
 * - Change DIFFICULTIES to tune the computer opponent. 'impossible' plays a
 *   perfect minimax game; the easier levels blunder on purpose so a new player
 *   can win.
 * - Change MARKS for a different pair of glyphs.
 * The human always moves first as X. Winning lines are the eight rows, columns,
 * and diagonals of a 3x3 board.
 */
import { createRng } from '../rng.js';
import { HINT_COST, hintButton } from './hints.js';

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export const DIFFICULTIES = {
  easy: { label: 'Easy', blunder: 0.5 },
  medium: { label: 'Medium', blunder: 0.2 },
  impossible: { label: 'Impossible', blunder: 0 }
};

export const MARKS = { human: 'X', computer: 'O' };

export const metadata = {
  id: 'tictactoe',
  title: 'Tic Tac Toe',
  kind: 'puzzles',
  subtitle: 'Beat the computer',
  art: 'tiles',
  description: 'Take turns claiming squares. Line up three of your marks in a row to win.'
};

export function createState({ difficulty = 'medium', seed } = {}) {
  const level = DIFFICULTIES[difficulty] ? difficulty : 'medium';
  return {
    board: Array.from({ length: 9 }, () => null),
    difficulty: level,
    turn: 'human',
    winner: null,
    line: null,
    moves: 0,
    seed: seed ?? null,
    finished: false,
    rewarded: false
  };
}

function winnerOf(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a], line };
  }
  return board.every(Boolean) ? { mark: 'draw', line: null } : null;
}

function empties(board) {
  const result = [];
  board.forEach((value, index) => { if (!value) result.push(index); });
  return result;
}

/* Classic minimax. The computer is 'O' and tries to minimise the human's score,
   so a perfect game can only be drawn, never lost. */
function minimax(board, isComputer) {
  const result = winnerOf(board);
  if (result) {
    if (result.mark === 'draw') return { score: 0 };
    return { score: result.mark === MARKS.computer ? 1 : -1 };
  }
  let best = null;
  for (const index of empties(board)) {
    board[index] = isComputer ? MARKS.computer : MARKS.human;
    const { score } = minimax(board, !isComputer);
    board[index] = null;
    if (!best || (isComputer ? score > best.score : score < best.score)) {
      best = { score, index };
    }
  }
  return best;
}

/* The square the computer should take, given its difficulty. */
export function computerMove(state, rng = createRng()) {
  const open = empties(state.board);
  if (!open.length) return null;
  const config = DIFFICULTIES[state.difficulty];
  if (config.blunder > 0 && rng.next() < config.blunder) return rng.pick(open);
  const board = [...state.board];
  return minimax(board, true).index;
}

function applyWinner(state) {
  const result = winnerOf(state.board);
  if (!result) return false;
  state.winner = result.mark;
  state.line = result.line;
  state.finished = true;
  return true;
}

/* The square that keeps the human's best line alive: a winning move, a block, or
   the centre. Purely advisory; used by the hint button. */
export function bestMove(state) {
  const board = [...state.board];
  for (const index of empties(board)) {
    board[index] = MARKS.human;
    if (winnerOf(board)?.mark === MARKS.human) return index;
    board[index] = null;
  }
  for (const index of empties(board)) {
    board[index] = MARKS.computer;
    const threat = winnerOf(board)?.mark === MARKS.computer;
    board[index] = null;
    if (threat) return index;
  }
  if (!board[4]) return 4;
  return empties(board)[0] ?? null;
}

export function render(state, { credits = 0 } = {}) {
  const cells = state.board.map((value, index) => {
    const win = state.line?.includes(index);
    const isHint = state.hint === index;
    const mark = value ? ` mark-${value.toLowerCase()}` : '';
    return `<button class="ttt-cell ${value ? 'is-filled' : ''}${mark} ${win ? 'is-win' : ''} ${isHint ? 'is-hinted' : ''}" data-ttt="${index}" aria-label="Square ${index + 1}${value ? `, ${value}` : ', empty'}" ${value || state.finished || state.turn !== 'human' ? 'disabled' : ''}>${value ?? ''}</button>`;
  }).join('');
  const difficulty = `<label class="difficulty-control"><span>Opponent</span><select data-ttt-difficulty aria-label="Opponent difficulty">${Object.entries(DIFFICULTIES).map(([id, item]) => `<option value="${id}" ${state.difficulty === id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>`;
  const banner = state.winner === 'draw'
    ? '<p class="game-banner is-stuck">A draw. Nobody blinked.</p>'
    : state.winner === MARKS.human
      ? '<p class="game-banner is-win">You win! Three in a row.</p>'
      : state.winner === MARKS.computer
        ? '<p class="game-banner is-stuck">The computer wins this round.</p>'
        : '';
  const status = state.turn === 'human' ? 'Your move' : 'Computer thinking';
  return {
    board: `<div class="ttt-board" role="group" aria-label="Tic Tac Toe board">${cells}</div>`,
    aside: `${banner}<p class="aside-label">TIC TAC TOE · ${DIFFICULTIES[state.difficulty].label.toUpperCase()} · ${state.moves} MOVES</p><h2 class="aside-title">${state.finished ? 'Round over' : status}</h2><p class="aside-copy">You are X and always go first. Claim three squares in a row, column, or diagonal. On Impossible the computer never loses, so aim for a draw.</p>${difficulty}${hintButton('Suggest a square', { credits, finished: state.finished })}<div class="reward-line"><span>Win the round</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

function playComputer(state, helpers) {
  if (state.turn !== 'computer' || state.finished) return;
  const index = computerMove(state, createRng(state.seed ? `${state.seed}:${state.moves}` : undefined));
  if (index === null) return;
  state.board[index] = MARKS.computer;
  if (!applyWinner(state)) state.turn = 'human';
  helpers?.rerender?.();
}

export function handleClick(target, state, helpers) {
  if (target.closest('[data-game-hint]')) {
    if (state.finished) { helpers.toast('This round is over.'); return true; }
    if (!helpers.spendCredits(HINT_COST)) return true;
    const index = bestMove(state);
    state.hint = index;
    helpers.toast(index === null ? 'No squares left.' : `Try square ${index + 1}.`);
    return { changed: true };
  }
  const cell = target.closest('[data-ttt]');
  if (!cell) return false;
  if (state.finished || state.turn !== 'human') return true;
  const index = Number(cell.dataset.ttt);
  if (state.board[index]) return true;
  state.hint = null;
  state.board[index] = MARKS.human;
  state.moves += 1;
  const ended = applyWinner(state);
  if (ended) return { changed: true, undoable: true, solved: state.winner === MARKS.human && !state.rewarded };
  // Lock the turn immediately so a double tap cannot play twice, then let the
  // computer answer on the next frame so the human's mark paints first.
  state.turn = 'computer';
  setTimeout(() => playComputer(state, helpers), 220);
  return { changed: true, undoable: true };
}

export function checkSolved(state) {
  return Boolean(state.winner === MARKS.human && !state.rewarded);
}

export default { metadata, createState, render, handleClick, checkSolved, computerMove, bestMove };
