/*
 * CUSTOMIZE WORD SEARCH HERE
 * - Edit WORDS and GRID_SIZE to change the word list and board dimensions.
 * - DIRECTIONS controls which orientations the generator may use.
 * - render() and handleClick() control how players mark word endpoints.
 */
const WORDS = ['CARD', 'SOLVE', 'PLAY', 'BRAIN', 'TILE'];
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const ALL_DIRECTIONS = [...DIRECTIONS, [0, -1], [-1, 0], [-1, -1], [-1, 1]];
const DIFFICULTIES = {
  easy: { gridSize: 8, words: ['CARD', 'PLAY', 'TILE'], directions: DIRECTIONS.slice(0, 2) },
  medium: { gridSize: 10, words: WORDS, directions: DIRECTIONS },
  hard: { gridSize: 12, words: ['SOLITAIRE', 'CROSSWORD', 'PUZZLE', 'MAHJONG', 'SUDOKU', 'BRAIN', 'CARDS', 'GAMES'], directions: ALL_DIRECTIONS }
};
import { HINT_COST, hintButton } from './hints.js';

export const metadata = {
  id: 'wordsearch',
  title: 'Word search',
  kind: 'puzzles',
  subtitle: 'Find a few words hiding in plain sight',
  art: 'letters',
  description: 'Find each word in the letter grid. Words may run horizontally, vertically, or diagonally.'
};

function buildPuzzle(words, gridSize, directions) {
  const grid = Array.from({ length: gridSize * gridSize }, () => '');
  const placements = [];
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    const word = words[wordIndex];
    let placement;
    for (let attempt = 0; attempt < 1000 && !placement; attempt++) {
      const [rowStep, columnStep] = directions[Math.floor(Math.random() * directions.length)];
      const row = Math.floor(Math.random() * gridSize);
      const column = Math.floor(Math.random() * gridSize);
      const cells = Array.from({ length: word.length }, (_, offset) => [row + rowStep * offset, column + columnStep * offset]);
      if (cells.some(([y, x]) => y < 0 || y >= gridSize || x < 0 || x >= gridSize)) continue;
      if (cells.some(([y, x], offset) => grid[y * gridSize + x] && grid[y * gridSize + x] !== word[offset])) continue;
      placement = cells.map(([y, x], offset) => {
        const index = y * gridSize + x;
        grid[index] = word[offset];
        return index;
      });
    }
    if (!placement) throw new Error(`Could not place word: ${word}`);
    placements.push(placement);
  }
  return { grid: grid.map(letter => letter || String.fromCharCode(65 + Math.floor(Math.random() * 26))), placements };
}

export function createState({ difficulty = 'medium' } = {}) {
  const level = DIFFICULTIES[difficulty] ? difficulty : 'medium';
  const settings = DIFFICULTIES[level];
  const puzzle = buildPuzzle(settings.words, settings.gridSize, settings.directions);
  return { ...puzzle, words: [...settings.words], gridSize: settings.gridSize, difficulty: level, found: [], first: null, hintedWord: null, finished: false };
}

export function isValidState(state) {
  const settings = DIFFICULTIES[state.difficulty];
  if (!settings || state.gridSize !== settings.gridSize || !Array.isArray(state.grid) ||
      state.grid.length !== settings.gridSize * settings.gridSize ||
      !Array.isArray(state.words) || state.words.join('|') !== settings.words.join('|') ||
      !Array.isArray(state.placements) || state.words.length !== state.placements.length) return false;
  for (let wordIndex = 0; wordIndex < state.words.length; wordIndex++) {
    const word = state.words[wordIndex];
    const path = state.placements[wordIndex];
    if (typeof word !== 'string' || !Array.isArray(path) || path.length !== word.length ||
        path.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= state.grid.length)) return false;
    let rowStep = null;
    let columnStep = null;
    for (let offset = 0; offset < path.length; offset++) {
      if (state.grid[path[offset]] !== word[offset]) return false;
      if (!offset) continue;
      const previousRow = Math.floor(path[offset - 1] / settings.gridSize);
      const previousColumn = path[offset - 1] % settings.gridSize;
      const rowStepNow = Math.floor(path[offset] / settings.gridSize) - previousRow;
      const columnStepNow = path[offset] % settings.gridSize - previousColumn;
      if (Math.abs(rowStepNow) > 1 || Math.abs(columnStepNow) > 1 || (!rowStepNow && !columnStepNow)) return false;
      if (!settings.directions.some(([rowStep, columnStep]) => rowStep === rowStepNow && columnStep === columnStepNow)) return false;
      if (rowStep !== null && (rowStepNow !== rowStep || columnStepNow !== columnStep)) return false;
      rowStep = rowStepNow;
      columnStep = columnStepNow;
    }
  }
  return Array.isArray(state.found) && new Set(state.found).size === state.found.length &&
    state.found.every(index => Number.isInteger(index) && index >= 0 && index < state.words.length);
}

export function render(state, { credits = 0 } = {}) {
  const foundCells = new Set(state.found.flatMap(index => state.placements[index]));
  const hintedCells = new Set(state.hintedWord === null ? [] : state.placements[state.hintedWord]);
  const grid = state.grid.map((letter, index) => `<button class="word-cell ${state.first === index ? 'is-first' : ''} ${foundCells.has(index) ? 'is-found' : ''} ${hintedCells.has(index) ? 'is-hinted' : ''}" data-letter="${index}" aria-label="${letter}, row ${Math.floor(index / state.gridSize) + 1}, column ${index % state.gridSize + 1}">${letter}</button>`).join('');
  const words = state.words.map((word, index) => `<span class="${state.found.includes(index) ? 'is-found' : ''} ${state.hintedWord === index ? 'is-hinted' : ''}">${word}</span>`).join('');
  const difficulty = `<label class="difficulty-control"><span>Difficulty</span><select data-word-difficulty aria-label="Word Search difficulty">${Object.keys(DIFFICULTIES).map(level => `<option value="${level}" ${state.difficulty === level ? 'selected' : ''}>${level[0].toUpperCase()}${level.slice(1)}</option>`).join('')}</select></label>`;
  return {
    board: `<div class="wordsearch-layout"><div class="wordsearch-board" style="--word-grid-size:${state.gridSize}" role="group" aria-label="Word search grid">${grid}</div><div class="word-list">${words}</div></div>`,
    aside: `<p class="aside-label">WORD SEARCH · ${state.difficulty.toUpperCase()}</p><h2 class="aside-title">Letters in motion</h2><p class="aside-copy">Tap the first and last letters of a word. Check across, down, and diagonally. Found words stay marked while you hunt.</p>${difficulty}${hintButton('Highlight a hidden word', { credits, finished: state.finished })}<div class="reward-line"><span>Find every word</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

export function handleClick(target, state, helpers) {
  if (target.closest('[data-game-hint]')) {
    const next = state.words.findIndex((_, index) => !state.found.includes(index) && index > (state.hintedWord ?? -1));
    const wordIndex = next < 0 ? state.words.findIndex((_, index) => !state.found.includes(index)) : next;
    if (wordIndex < 0) { helpers.toast('Every word has been found.'); return true; }
    if (!helpers.spendCredits(HINT_COST)) return true;
    state.hintedWord = wordIndex;
    state.first = state.placements[wordIndex][0];
    return true;
  }
  const cell = target.closest('[data-letter]');
  if (!cell) return false;
  const index = Number(cell.dataset.letter);
  if (state.first === null) {
    state.first = index;
    return true;
  }
  const start = state.first;
  const placementIndex = state.placements.findIndex((placement, wordIndex) => !state.found.includes(wordIndex) &&
    ((placement[0] === start && placement.at(-1) === index) || (placement[0] === index && placement.at(-1) === start)));
  state.first = null;
  if (placementIndex < 0) {
    helpers.toast('Those endpoints do not spell a hidden word.');
    return true;
  }
  state.found.push(placementIndex);
  if (state.found.length === state.words.length) {
    state.finished = true;
    helpers.complete('wordsearch');
  }
  return true;
}

export default { metadata, createState, isValidState, render, handleClick };