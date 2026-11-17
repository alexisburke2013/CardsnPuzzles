/*
 * CROSSWORD DATA
 * A 5 × 5 mini grid. '#' marks a block; other characters are the solution.
 * ENTRIES lists each answer with its start cell; crossing letters are shared
 * automatically because the grid is the single source of truth.
 *
 * To ship a new puzzle, change GRID and ENTRIES together so every maximal run
 * of two or more letters is a listed answer.
 */
export const GRID = [
  'CLUES',
  'L###T',
  'AUDIO',
  'S###N',
  'SPACE'
];

export const ENTRIES = [
  { number: 1, direction: 'across', row: 0, column: 0, answer: 'CLUES', clue: 'Hints that nudge you toward an answer' },
  { number: 1, direction: 'down', row: 0, column: 0, answer: 'CLASS', clue: 'A group of pupils, or a category' },
  { number: 2, direction: 'down', row: 0, column: 4, answer: 'STONE', clue: 'A hard mineral, or a fruit pit' },
  { number: 3, direction: 'across', row: 2, column: 0, answer: 'AUDIO', clue: 'The sound part of a broadcast' },
  { number: 4, direction: 'across', row: 4, column: 0, answer: 'SPACE', clue: 'Room to move, or the final frontier' }
];

export const BLOCK = '#';
