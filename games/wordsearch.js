/*
 * CUSTOMIZE WORD SEARCH HERE
 * - Edit WORDS and GRID_SIZE to change the word list and board dimensions.
 * - DIRECTIONS controls which orientations the generator may use.
 * - render() and handleClick() control how players mark word endpoints.
 */
const WORDS = ['CARD', 'SOLVE', 'PLAY', 'BRAIN', 'TILE'];
const GRID_SIZE = 10;
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

export const metadata = {
  id: 'wordsearch',
  title: 'Word search',
  kind: 'puzzles',
  subtitle: 'Find a few words hiding in plain sight',
  art: 'letters',
  description: 'Find each word in the letter grid. Words may run horizontally, vertically, or diagonally.'
};

function buildPuzzle() {
  const grid = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => '');
  const placements = [];
  for (let wordIndex = 0; wordIndex < WORDS.length; wordIndex++) {
    const word = WORDS[wordIndex];
    let placement;
    for (let attempt = 0; attempt < 300 && !placement; attempt++) {
      const [rowStep, columnStep] = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const row = Math.floor(Math.random() * GRID_SIZE);
      const column = Math.floor(Math.random() * GRID_SIZE);
      const cells = Array.from({ length: word.length }, (_, offset) => [row + rowStep * offset, column + columnStep * offset]);
      if (cells.some(([y, x]) => y < 0 || y >= GRID_SIZE || x < 0 || x >= GRID_SIZE)) continue;
      if (cells.some(([y, x], offset) => grid[y * GRID_SIZE + x] && grid[y * GRID_SIZE + x] !== word[offset])) continue;
      placement = cells.map(([y, x], offset) => {
        const index = y * GRID_SIZE + x;
        grid[index] = word[offset];
        return index;
      });
    }
    if (!placement) throw new Error(`Could not place word: ${word}`);
    placements.push(placement);
  }
  return { grid: grid.map(letter => letter || String.fromCharCode(65 + Math.floor(Math.random() * 26))), placements };
}

export function createState() {
  const puzzle = buildPuzzle();
  return { ...puzzle, words: [...WORDS], found: [], first: null, finished: false };
}

export function render(state) {
  const foundCells = new Set(state.found.flatMap(index => state.placements[index]));
  const grid = state.grid.map((letter, index) => `<button class="word-cell ${state.first === index ? 'is-first' : ''} ${foundCells.has(index) ? 'is-found' : ''}" data-letter="${index}" aria-label="${letter}, row ${Math.floor(index / GRID_SIZE) + 1}, column ${index % GRID_SIZE + 1}">${letter}</button>`).join('');
  const words = state.words.map((word, index) => `<span class="${state.found.includes(index) ? 'is-found' : ''}">${word}</span>`).join('');
  return {
    board: `<div class="wordsearch-layout"><div class="wordsearch-board" style="--word-grid-size:${GRID_SIZE}" role="group" aria-label="Word search grid">${grid}</div><div class="word-list">${words}</div></div>`,
    aside: '<p class="aside-label">WORD SEARCH · TAKE A LOOK</p><h2 class="aside-title">Letters in motion</h2><p class="aside-copy">Tap the first and last letters of a word. Check across, down, and diagonally. Found words stay marked while you hunt.</p><div class="reward-line"><span>Find every word</span><strong>+25 points<br>+50 XP</strong></div>'
  };
}

export function handleClick(target, state, helpers) {
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

export default { metadata, createState, render, handleClick };