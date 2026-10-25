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

export const gameModules = Object.fromEntries(
  [solitaire, sudoku, mahjong, wordsearch, crossword].map(game => [game.metadata.id, game])
);

export const comingSoonGames = [
  { id: 'tictactoe', title: 'Tic Tac Toe', kind: 'puzzles', subtitle: 'Coming to the game shelf', art: 'tiles', coming: true },
  { id: 'battleship', title: 'Battleships', kind: 'puzzles', subtitle: 'Coming to the game shelf', art: 'cross', coming: true },
  { id: 'minesweeper', title: 'Minesweeper', kind: 'puzzles', subtitle: 'Coming to the game shelf', art: 'sudoku', coming: true }
];

export default gameModules;