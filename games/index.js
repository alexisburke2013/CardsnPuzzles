/*
 * GAME REGISTRY
 * Add a new game by creating ./your-game.js and adding its default export below.
 * Each game module exports metadata, createState(), render(), and the input handlers it needs.
 */
import solitaire from './solitaire.js';
import sudoku from './sudoku.js';
import mahjong from './mahjong.js';
import wordsearch from './wordsearch.js';
import crossword from './crossword.js';
import g2048 from './g2048.js';
import memory from './memory.js';
import tictactoe from './tictactoe.js';
import minesweeper from './minesweeper.js';

export const gameModules = Object.fromEntries(
  [solitaire, sudoku, mahjong, wordsearch, crossword, g2048, memory, tictactoe, minesweeper].map(game => [game.metadata.id, game])
);

export const comingSoonGames = [
  { id: 'battleship', title: 'Battleships', kind: 'puzzles', subtitle: 'Coming to the game shelf', art: 'cross', coming: true }
];

export default gameModules;