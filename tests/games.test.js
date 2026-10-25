import assert from 'node:assert/strict';
import test from 'node:test';
import { gameModules } from '../games/index.js';

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
  const state = sudoku.createState();
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

test('Sudoku arrow navigation skips fixed clues', () => {
  const state = gameModules.sudoku.createState();
  const event = {
    key: 'ArrowRight',
    target: { closest: () => ({ dataset: { cell: '2' } }) },
    preventDefault() {}
  };
  const result = gameModules.sudoku.handleKeyDown(event, state);
  assert.equal(result.changed, true);
  assert.equal(state.selected, 4);
  assert.equal(state.givens[state.selected], 0);
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
    assert.equal(moved, true);
    assert.equal(state.tableau[1][0].rank, 13);
    assert.equal(state.tableau[0][0].faceDown, false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
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
  for (let boardNumber = 0; boardNumber < 25; boardNumber++) {
    const state = gameModules.wordsearch.createState();
    state.placements.forEach((placement, index) => {
      assert.equal(placement.map(cell => state.grid[cell]).join(''), state.words[index]);
    });
  }
});

test('Crossword awards completion only after every clue is solved', () => {
  const crossword = gameModules.crossword;
  const state = crossword.createState();
  for (let column = 0; column < 5; column++) {
    crossword.handleInput({
      matches: selector => selector === '[data-cross-row]',
      dataset: { crossRow: '0', crossCol: String(column) },
      value: state.answers[0][column]
    }, state);
  }
  assert.deepEqual(state.solved, [0]);
  assert.equal(state.finished, false);
  for (let row = 1; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      crossword.handleInput({
        matches: selector => selector === '[data-cross-row]',
        dataset: { crossRow: String(row), crossCol: String(column) },
        value: state.answers[row][column]
      }, state);
    }
  }
  assert.equal(state.finished, true);
});