import assert from 'node:assert/strict';
import test from 'node:test';
import { gameModules } from '../games/index.js';
import { normalizeWalletProfile, spendCredits, awardCredits } from '../wallet.js';
import { HINT_COST } from '../games/hints.js';
import { createRng, todaySeed } from '../rng.js';
import { save, load, clear, SAVE_VERSION } from '../store.js';
import { createHistory, commit, reset, undo, redo, canUndo, canRedo } from '../history.js';
import { normalizeStats, recordResult, winRate } from '../stats.js';
import { earnCredits, remainingToday, DAILY_CREDIT_CAP } from '../economy.js';
import { dailySeed, normalizeDaily, isCompletedToday, completeDaily, currentStreak } from '../daily.js';

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const quietHelpers = { toast() {}, complete() {} };

function fakeTarget(selector, dataset) {
  return {
    dataset,
    matches: candidate => candidate === selector,
    closest: candidate => candidate === selector ? { dataset } : null
  };
}

test('Sudoku answer is valid and editable inputs complete the seeded puzzle', () => {
  const sudoku = gameModules.sudoku;
  const state = sudoku.createState({ seed: 'test-board', difficulty: 'medium' });
  for (let row = 0; row < 9; row++) {
    assert.deepEqual(state.solution.slice(row * 9, row * 9 + 9).sort(), digits);
    const column = Array.from({ length: 9 }, (_, offset) => state.solution[offset * 9 + row]);
    assert.deepEqual(column.sort(), digits);
  }
  state.givens.forEach((value, index) => { if (value) assert.equal(value, state.solution[index]); });
  for (let index = 0; index < 81; index++) {
    if (!state.givens[index]) {
      sudoku.handleInput({
        matches: selector => selector === '[data-cell]',
        dataset: { cell: String(index) },
        value: String(state.solution[index])
      }, state);
    }
  }
  assert.equal(sudoku.checkSolved(state), true);
  assert.match(sudoku.render(state).board, /inputmode="numeric"/);
});

test('Sudoku difficulty changes clue count and boards are seed-reproducible', () => {
  const sudoku = gameModules.sudoku;
  const easy = sudoku.createState({ seed: 'diff', difficulty: 'easy' });
  const hard = sudoku.createState({ seed: 'diff', difficulty: 'hard' });
  const clues = state => state.givens.filter(Boolean).length;
  assert.ok(clues(easy) > clues(hard), 'easy board has more clues than hard');
  const again = sudoku.createState({ seed: 'diff', difficulty: 'easy' });
  assert.deepEqual(again.givens, easy.givens, 'same seed rebuilds the same board');
});

test('Sudoku pencil notes toggle and mistakes are counted', () => {
  const sudoku = gameModules.sudoku;
  const state = sudoku.createState({ seed: 'notes', difficulty: 'medium' });
  const empty = state.cells.findIndex((value, index) => !value && !state.givens[index]);
  state.selected = empty;
  state.noteMode = true;
  sudoku.handleClick(fakeTarget('[data-number]', { number: '5' }), state, quietHelpers);
  assert.deepEqual(state.notes[empty], [5], 'note is recorded in note mode');
  assert.equal(state.cells[empty], 0, 'note mode does not fill the cell');
  sudoku.handleClick(fakeTarget('[data-number]', { number: '5' }), state, quietHelpers);
  assert.deepEqual(state.notes[empty], [], 'tapping the same note clears it');
  state.noteMode = false;
  const wrong = state.solution[empty] === 9 ? 1 : 9;
  const result = sudoku.handleClick(fakeTarget('[data-number]', { number: String(wrong) }), state, quietHelpers);
  assert.equal(state.mistakes, 1, 'a wrong entry counts as a mistake');
  assert.equal(result.undoable, true, 'a digit entry is undoable');
});

test('Sudoku arrow navigation skips fixed clues', () => {
  const sudoku = gameModules.sudoku;
  const state = sudoku.createState({ seed: 'arrows', difficulty: 'medium' });
  const start = state.givens.findIndex((value, index) => !value && index % 9 < 8 && !state.givens[index + 1]);
  const event = {
    key: 'ArrowRight',
    target: { closest: () => ({ dataset: { cell: String(start) } }) },
    preventDefault() {}
  };
  const result = sudoku.handleKeyDown(event, state);
  assert.equal(result.changed, true);
  assert.equal(state.givens[state.selected], 0, 'lands on a non-fixed cell');
  assert.ok(state.selected > start, 'moves to the right');
});

test('Solitaire deals 52 cards and exposes valid runs for click moves', () => {
  const solitaire = gameModules.solitaire;
  const state = solitaire.createState();
  assert.equal(state.tableau.flat().length + state.stock.length, 52);
  assert.equal(state.tableau.flat().filter(card => card.faceDown).length, 21);
  assert(state.tableau.every(pile => !pile.at(-1).faceDown));

  state.tableau = [
    [{ rank: 3, suit: '♠', faceDown: false }, { rank: 2, suit: '♥', faceDown: false }],
    [{ rank: 4, suit: '♥', faceDown: false }], [], [], [], [], []
  ];
  solitaire.handleClick(fakeTarget('[data-card-pile]', { cardPile: '0', cardIndex: '0' }), state, quietHelpers);
  solitaire.handleClick(fakeTarget('[data-pile]', { pile: '1' }), state, quietHelpers);
  assert.equal(state.tableau[0].length, 0);
  assert.deepEqual(state.tableau[1].map(card => card.rank), [4, 3, 2]);
});

test('Solitaire pointer drag drops a card and flips the newly exposed card', () => {
  const solitaire = gameModules.solitaire;
  const state = solitaire.createState();
  state.tableau = [[
    { rank: 8, suit: '♠', faceDown: true },
    { rank: 13, suit: '♦', faceDown: false }
  ], [], [], [], [], [], []];

  const classes = new Set();
  const source = {
    dataset: { cardPile: '0', cardIndex: '1' },
    style: {},
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    closest: selector => selector.includes('data-card-pile') ? source : null,
    matches: selector => selector === '[data-waste-card]' ? false : selector === '[data-card-pile]'
  };
  const destination = {
    dataset: { pile: '1' },
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    closest: selector => selector.includes('data-pile') ? destination : null,
    hasAttribute: name => name === 'data-pile'
  };
  const previousDocument = globalThis.document;
  globalThis.document = { elementFromPoint: () => destination, querySelectorAll: () => [] };
  try {
    const pointer = { pointerId: 1, button: 0, clientX: 10, clientY: 10, target: source };
    solitaire.handlePointerDown(pointer, state);
    solitaire.handlePointerMove({ ...pointer, clientX: 30, target: source }, state);
    const moved = solitaire.handlePointerUp({ ...pointer, clientX: 30 }, state, quietHelpers);
    assert.ok(moved && moved.changed, 'a completed drag reports a change');
    assert.equal(state.tableau[1][0].rank, 13);
    assert.equal(state.tableau[0][0].faceDown, false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('Solitaire can complete by building all four foundations to King', () => {
  const solitaire = gameModules.solitaire;
  const state = solitaire.createState();
  const suits = ['♠', '♥', '♦', '♣'];
  state.stock = [];
  state.waste = [];
  state.foundations = suits.map(suit => Array.from({ length: 12 }, (_, index) => ({ rank: index + 1, suit })));
  state.tableau = suits.map((suit, pile) => [{ rank: 13, suit, faceDown: false }]).concat([[], [], []]);
  let completions = 0;
  const helpers = { ...quietHelpers, complete() { completions++; } };
  suits.forEach((_, pile) => {
    solitaire.handleClick(fakeTarget('[data-card-pile]', { cardPile: String(pile), cardIndex: '0' }), state, helpers);
    solitaire.handleClick(fakeTarget('[data-foundation]', { foundation: String(pile) }), state, helpers);
  });
  assert.equal(state.finished, true);
  assert.equal(completions, 1);
});

test('Mahjong starts with open matching pairs and can clear the layered layout', () => {
  const mahjong = gameModules.mahjong;
  const state = mahjong.createState();
  assert.equal(state.tiles.length, 20);
  for (const face of new Set(state.tiles.map(tile => tile.face))) {
    assert.equal(state.tiles.filter(tile => tile.face === face).length, 2);
  }
  const openTiles = () => state.tiles.filter(tile => !tile.removed &&
    !state.tiles.some(other => !other.removed && other.layer > tile.layer && other.row === tile.row && other.column === tile.column) &&
    (!state.tiles.some(other => !other.removed && other.layer === tile.layer && other.row === tile.row && other.column === tile.column - 1) ||
      !state.tiles.some(other => !other.removed && other.layer === tile.layer && other.row === tile.row && other.column === tile.column + 1)));
  let completions = 0;
  const helpers = { ...quietHelpers, complete() { completions++; } };
  for (let pairNumber = 0; pairNumber < 10; pairNumber++) {
    const open = openTiles();
    const first = open.find((tile, index) => open.slice(index + 1).some(other => other.face === tile.face));
    assert(first, 'an open pair is available');
    const second = open.find(tile => tile.id !== first.id && tile.face === first.face);
    mahjong.handleClick(fakeTarget('[data-tile]', { tile: String(first.id) }), state, helpers);
    mahjong.handleClick(fakeTarget('[data-tile]', { tile: String(second.id) }), state, helpers);
  }
  assert.equal(state.finished, true);
  assert.equal(completions, 1);
});

test('Word Search generated placements spell every listed word', () => {
  const wordsearch = gameModules.wordsearch;
  for (const [difficulty, gridSize] of [['easy', 8], ['medium', 10], ['hard', 12]]) {
    for (let boardNumber = 0; boardNumber < 10; boardNumber++) {
      const state = wordsearch.createState({ difficulty });
      assert.equal(state.gridSize, gridSize);
      assert.equal(wordsearch.isValidState(state), true);
      state.placements.forEach((placement, index) => {
        assert.equal(placement.map(cell => state.grid[cell]).join(''), state.words[index]);
      });
      assert.match(wordsearch.render(state).aside, new RegExp(`value="${difficulty}" selected`));
      let completions = 0;
      const helpers = { ...quietHelpers, complete() { completions++; } };
      for (const placement of state.placements) {
        wordsearch.handleClick(fakeTarget('[data-letter]', { letter: String(placement[0]) }), state, helpers);
        wordsearch.handleClick(fakeTarget('[data-letter]', { letter: String(placement.at(-1)) }), state, helpers);
      }
      assert.equal(state.finished, true);
      assert.equal(state.found.length, state.words.length);
      assert.equal(completions, 1);
    }
  }
  assert.equal(gameModules.wordsearch.isValidState({ grid: Array(64).fill('A'), words: ['CARD'], placements: [[0, 0]], found: [] }), false);
});

test('Crossword solves across and down entries and shares crossing letters', () => {
  const crossword = gameModules.crossword;
  const state = crossword.createState();
  const fillEntry = entry => {
    entry.cells.forEach(({ row, column }) => {
      crossword.handleInput({
        matches: selector => selector === '[data-cross-row]',
        dataset: { crossRow: String(row), crossCol: String(column) },
        value: state.solution[row][column]
      }, state);
    });
  };
  assert.equal(state.entries.some(entry => entry.direction === 'down'), true, 'has down clues');
  const first = state.entries[0];
  fillEntry(first);
  assert.equal(state.solved.includes(`${first.number}-${first.direction}`), true, 'entry marked solved');
  assert.equal(state.finished, false, 'not finished after one entry');
  state.entries.forEach(fillEntry);
  assert.equal(state.finished, true);
  assert.equal(state.solved.length, state.entries.length);
});

test('Crossword reveals a hint letter and marks the entry undoable', () => {
  const crossword = gameModules.crossword;
  const state = crossword.createState();
  const wallet = { credits: 20 };
  const result = crossword.handleClick(fakeTarget('[data-game-hint]', {}), state, {
    ...quietHelpers,
    spendCredits: amount => spendCredits(wallet, amount)
  });
  assert.equal(wallet.credits, 20 - HINT_COST);
  assert.equal(result.undoable, true);
  const filled = state.letters.flat().filter((letter, index) => letter && letter !== '#').length;
  assert.equal(filled, 1, 'exactly one letter revealed');
});

test('Legacy points migrate into a single earnable credits wallet', () => {
  assert.equal(normalizeWalletProfile({ points: 42 }).credits, 42);
  assert.equal(normalizeWalletProfile({ points: 0 }).credits, 15);
  assert.equal(normalizeWalletProfile({ credits: 0, points: 42 }).credits, 0);
  const profile = normalizeWalletProfile({ points: 10 });
  assert.equal('points' in profile, false);
  assert.equal(spendCredits(profile, HINT_COST), true);
  assert.equal(spendCredits(profile, 20), false);
  assert.equal(awardCredits(profile, 25), 30);
});

test('Every starter game offers a five-credit hint and honors the shared wallet', () => {
  for (const game of Object.values(gameModules)) {
    const state = game.createState();
    assert.match(game.render(state, { credits: 15 }).aside, /data-game-hint/, `${game.metadata.id} renders a hint`);
    assert.match(game.render(state, { credits: HINT_COST - 1 }).aside, /data-game-hint[^>]*disabled/, `${game.metadata.id} disables unaffordable hints`);
    const target = fakeTarget('[data-game-hint]', {});
    const affordableWallet = { credits: 10 };
    const affordableHelpers = {
      ...quietHelpers,
      spendCredits: amount => spendCredits(affordableWallet, amount)
    };
    game.handleClick(target, state, affordableHelpers);
    assert.equal(affordableWallet.credits, 10 - HINT_COST, `${game.metadata.id} charges for a hint`);

    const poorWallet = { credits: HINT_COST - 1 };
    const freshState = game.createState();
    game.handleClick(target, freshState, {
      ...quietHelpers,
      spendCredits: amount => spendCredits(poorWallet, amount)
    });
    assert.equal(poorWallet.credits, HINT_COST - 1, `${game.metadata.id} does not overspend`);
  }
});

test('createRng is deterministic per seed and independent across seeds', () => {
  const a = createRng('daily-2026-11-16').shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const b = createRng('daily-2026-11-16').shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const c = createRng('daily-2026-11-17').shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(a, b, 'same seed reproduces the same order');
  assert.notDeepEqual(a, c, 'different seeds produce different orders');
  assert.deepEqual([...a].sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'shuffle keeps every item');
  assert.ok(createRng('x').int(5) < 5, 'int stays within range');
  assert.equal(todaySeed(new Date('2026-11-16T23:30:00Z')), '2026-11-16');
});

test('store round-trips a save, reports version, and reads the legacy key', () => {
  const backing = new Map();
  globalThis.localStorage = {
    getItem: key => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: key => backing.delete(key)
  };
  try {
    clear();
    assert.equal(load(), null, 'empty storage yields no save');
    save({ profile: { xp: 10, credits: 20 }, games: {} });
    const restored = load();
    assert.equal(restored.version, SAVE_VERSION);
    assert.equal(restored.profile.credits, 20);
    backing.set('playfield-save-v1', JSON.stringify({ version: 1, profile: { xp: 5, credits: 9 } }));
    backing.delete('playfield-save-v2');
    const legacy = load();
    assert.equal(legacy.version, 1);
    assert.equal(legacy.profile.credits, 9, 'legacy v1 profile is still readable');
  } finally {
    delete globalThis.localStorage;
  }
});
test('History records steps, undoes, redoes, and drops the redo tail', () => {
  const history = createHistory(3);
  reset(history, 'a');
  assert.equal(canUndo(history), false);
  commit(history, 'b');
  commit(history, 'c');
  assert.equal(canUndo(history), true);
  assert.equal(undo(history), 'b');
  assert.equal(redo(history), 'c');
  commit(history, 'd');
  assert.equal(canRedo(history), false, 'committing drops the redo tail');
  commit(history, 'e');
  commit(history, 'f');
  assert.equal(history.stack.length, 3, 'limit trims the oldest snapshot');
});

test('Stats track wins, streaks, bests, and win rate', () => {
  const stats = normalizeStats({});
  recordResult(stats, 'sudoku', { outcome: 'won', time: 90, moves: 40, hints: 1 });
  recordResult(stats, 'sudoku', { outcome: 'won', time: 60, moves: 35 });
  recordResult(stats, 'sudoku', { outcome: 'lost' });
  const entry = stats.sudoku;
  assert.equal(entry.played, 3);
  assert.equal(entry.won, 2);
  assert.equal(entry.lost, 1);
  assert.equal(entry.bestTime, 60, 'keeps the fastest time');
  assert.equal(entry.fewestMoves, 35);
  assert.equal(entry.hintsUsed, 1);
  assert.equal(entry.streak, 0, 'a loss resets the streak');
  assert.equal(entry.bestStreak, 2);
  assert.equal(winRate(entry), 67);
});

test('Economy caps daily credit earnings but leaves XP untouched', () => {
  const profile = { credits: 0 };
  assert.equal(earnCredits(profile, 100, '2026-11-11'), 100);
  assert.equal(remainingToday(profile, '2026-11-11'), DAILY_CREDIT_CAP - 100);
  assert.equal(earnCredits(profile, 100, '2026-11-11'), DAILY_CREDIT_CAP - 100, 'second earn is clamped');
  assert.equal(profile.credits, DAILY_CREDIT_CAP);
  assert.equal(earnCredits(profile, 50, '2026-11-11'), 0, 'cap reached grants nothing');
  assert.equal(earnCredits(profile, 30, '2026-11-12'), 30, 'new day resets the cap');
  assert.equal(profile.credits, DAILY_CREDIT_CAP + 30);
});

test('Daily streaks grow on consecutive days and reset after a gap', () => {
  const daily = normalizeDaily({});
  const day1 = new Date('2026-11-10T12:00:00Z');
  const day2 = new Date('2026-11-11T12:00:00Z');
  const day4 = new Date('2026-11-13T12:00:00Z');
  assert.equal(completeDaily(daily, day1), 1);
  assert.equal(isCompletedToday(daily, day1), true);
  assert.equal(completeDaily(daily, day1), 1, 'same day does not double count');
  assert.equal(completeDaily(daily, day2), 2, 'next day extends the streak');
  assert.equal(currentStreak(daily, day2), 2);
  assert.equal(completeDaily(daily, day4), 1, 'a gap resets the streak');
  assert.equal(daily.bestStreak, 2);
  assert.equal(currentStreak(daily, new Date('2026-11-20T12:00:00Z')), 0, 'stale streak reads as zero');
  assert.equal(dailySeed('sudoku', day1), 'daily:sudoku:2026-11-10');
});

test('Mahjong detects dead ends and can reshuffle the remaining tiles', () => {
  const mahjong = gameModules.mahjong;
  const state = mahjong.createState();
  assert.equal(mahjong.hasMoves(state), true);
  const before = state.tiles.map(tile => tile.face).sort().join('');
  mahjong.shuffleRemaining(state);
  const after = state.tiles.map(tile => tile.face).sort().join('');
  assert.equal(before, after, 'shuffle keeps the same multiset of faces');
  assert.equal(state.shuffles, 1);
  // A deadlocked board (all remaining faces unique) reports no moves.
  const dead = { tiles: [{ id: 0, row: 0, column: 0, layer: 0, face: 'A' }, { id: 1, row: 0, column: 1, layer: 0, face: 'B' }] };
  assert.equal(mahjong.hasMoves(dead), false);
});

test('Solitaire draw-three deals three cards and recycles the waste', () => {
  const solitaire = gameModules.solitaire;
  const state = solitaire.createState({ seed: 'draw', draw: 3 });
  assert.equal(state.draw, 3);
  const stockBefore = state.stock.length;
  solitaire.handleClick(fakeTarget('[data-stock]', {}), state, quietHelpers);
  assert.equal(state.waste.length, 3, 'three cards drawn');
  assert.equal(state.stock.length, stockBefore - 3);
  assert.equal(state.moves, 1, 'a draw counts as a move');
  solitaire.handleClick(fakeTarget('[data-recycle]', {}), state, quietHelpers);
  assert.equal(state.waste.length, 0);
  assert.equal(state.stock.length, stockBefore, 'waste returns to the stock');
});

test('Solitaire auto-complete sweeps ready cards home and reports dead ends', () => {
  const solitaire = gameModules.solitaire;
  const state = solitaire.createState();
  state.stock = [];
  state.waste = [];
  state.foundations = [[], [], [], []];
  state.tableau = [
    [{ rank: 1, suit: '♠', faceDown: false }],
    [{ rank: 1, suit: '♥', faceDown: false }],
    [{ rank: 5, suit: '♦', faceDown: false }],
    [], [], [], []
  ];
  const moved = solitaire.autoComplete(state);
  assert.equal(moved, 2, 'both aces go home');
  assert.equal(state.foundations[0][0].rank, 1);
  assert.equal(state.foundations[1][0].rank, 1);
  assert.equal(state.tableau[2][0].rank, 5, 'the unready card stays put');
  assert.equal(solitaire.hasMovesLeft({ stock: [], waste: [], tableau: [[{ rank: 5, suit: '♦', faceDown: false }]], foundations: [[], [], [], []] }), false, 'no moves left is detected');
});

test('Word Search drag previews a straight line and resolves the word on release', () => {
  const wordsearch = gameModules.wordsearch;
  assert.deepEqual(wordsearch.lineBetween(5, 0, 12), [0, 6, 12], 'diagonal line between corners');
  assert.deepEqual(wordsearch.lineBetween(5, 0, 2), [0, 1, 2], 'horizontal line');
  assert.equal(wordsearch.lineBetween(5, 0, 7), null, 'knight-move endpoints are not a line');
  const state = wordsearch.createState({ difficulty: 'easy' });
  const placement = state.placements[0];
  const previousDocument = globalThis.document;
  const cellFor = index => ({ dataset: { letter: String(index) } });
  globalThis.document = { elementFromPoint: () => ({ closest: () => cellFor(placement.at(-1)) }) };
  try {
    wordsearch.handlePointerDown({ pointerId: 7, button: 0, target: { closest: () => cellFor(placement[0]) } }, state);
    wordsearch.handlePointerMove({ pointerId: 7, clientX: 0, clientY: 0 }, state);
    assert.deepEqual(state.preview, placement, 'preview highlights the word path');
    let completions = 0;
    wordsearch.handlePointerUp({ pointerId: 7, clientX: 0, clientY: 0 }, state, { ...quietHelpers, complete() { completions++; } });
    assert.equal(state.found.length, 1, 'the dragged word is found');
    assert.equal(state.preview.length, 0, 'preview clears after release');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('2048 merges equal tiles, spawns a new tile, and reaches the target', () => {
  const game = gameModules.g2048;
  const state = game.createState({ seed: 'merge' });
  assert.equal(state.cells.filter(Boolean).length, 2, 'starts with two tiles');
  state.cells = [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const before = state.cells.filter(Boolean).length;
  const moved = game.move(state, 'left');
  assert.equal(moved, true);
  assert.equal(state.cells[0], 4, 'the pair merged into a four');
  assert.equal(state.score, 4, 'score tracks the merged value');
  assert.equal(state.cells.filter(Boolean).length, before, 'one merged away, one spawned back');
  // A board of only 2048 tiles satisfies the win condition.
  state.cells = [2048, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  game.move(state, 'right');
  assert.equal(state.won, true, 'reaching the target sets the win flag');
  assert.equal(game.checkSolved(state), true, 'the hub is told the board is solved');
  // Full board with no equal neighbours has no moves.
  assert.equal(game.hasMoves({ cells: [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2] }), false);
});

test('Memory deals matched pairs, scores a match, and detects completion', () => {
  const game = gameModules.memory;
  const state = game.createState({ difficulty: 'easy', seed: 'pairs' });
  assert.equal(state.deck.length, 12, 'easy deals six pairs');
  const counts = {};
  state.deck.forEach(card => { counts[card.face] = (counts[card.face] || 0) + 1; });
  assert.ok(Object.values(counts).every(count => count === 2), 'every face appears exactly twice');
  // Force a known matching pair and flip both.
  state.deck[0].face = '♥';
  state.deck[1].face = '♥';
  game.handleClick(fakeTarget('[data-memory]', { memory: '0' }), state, quietHelpers);
  const result = game.handleClick(fakeTarget('[data-memory]', { memory: '1' }), state, quietHelpers);
  assert.equal(state.deck[0].matched, true);
  assert.equal(state.matched, 1, 'a pair is recorded');
  assert.equal(result.undoable, true, 'a flip pair is undoable');
  // Complete the rest by force and confirm the solved signal.
  state.deck.forEach(card => { card.matched = true; });
  state.matched = state.pairs;
  state.finished = true;
  assert.equal(game.checkSolved(state), true);
});

test('Feedback module stays safe when audio and vibration are unavailable', async () => {
  const feedback = await import('../feedback.js');
  assert.doesNotThrow(() => feedback.playCue('move'));
  assert.doesNotThrow(() => feedback.vibrate('match'));
  assert.doesNotThrow(() => feedback.feedback('win'));
  feedback.setMuted(true);
  assert.equal(feedback.isMuted(), true);
  assert.doesNotThrow(() => feedback.feedback('win'));
  feedback.setMuted(false);
  assert.equal(feedback.isMuted(), false);
});
