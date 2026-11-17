/*
 * SUDOKU GENERATOR
 * Builds a fresh, uniquely-solvable 9 × 9 puzzle from a seed. The same seed
 * always yields the same board, which is what makes daily challenges and shared
 * boards reproducible. Difficulty controls how many clues survive the dig.
 *
 * Pure module: no DOM, no storage. sudoku.js owns state and rendering.
 */
import { createRng } from '../rng.js';

const SIDE = 9;
const BOX = 3;
const CLUES = { easy: 40, medium: 32, hard: 26 };

function conflicts(grid, index, value) {
  const row = Math.floor(index / SIDE);
  const column = index % SIDE;
  for (let offset = 0; offset < SIDE; offset++) {
    if (offset !== column && grid[row * SIDE + offset] === value) return true;
    if (offset !== row && grid[offset * SIDE + column] === value) return true;
  }
  const boxRow = Math.floor(row / BOX) * BOX;
  const boxColumn = Math.floor(column / BOX) * BOX;
  for (let y = boxRow; y < boxRow + BOX; y++) {
    for (let x = boxColumn; x < boxColumn + BOX; x++) {
      const cell = y * SIDE + x;
      if (cell !== index && grid[cell] === value) return true;
    }
  }
  return false;
}

function fill(grid, rng) {
  const index = grid.indexOf(0);
  if (index < 0) return true;
  for (const value of rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (!conflicts(grid, index, value)) {
      grid[index] = value;
      if (fill(grid, rng)) return true;
      grid[index] = 0;
    }
  }
  return false;
}

/* Count solutions, stopping once `limit` is reached. Used to prove uniqueness. */
function countSolutions(grid, limit = 2) {
  const index = grid.indexOf(0);
  if (index < 0) return 1;
  let count = 0;
  for (let value = 1; value <= 9; value++) {
    if (!conflicts(grid, index, value)) {
      grid[index] = value;
      count += countSolutions(grid, limit - count);
      grid[index] = 0;
      if (count >= limit) break;
    }
  }
  return count;
}

export function generateSolved(seed) {
  const rng = createRng(seed);
  const grid = new Array(SIDE * SIDE).fill(0);
  fill(grid, rng);
  return grid;
}

/* Remove clues in symmetric pairs, keeping only removals that preserve a unique
   solution. Passes repeat until the clue target is met or the attempt budget is
   spent, so easy/medium/hard differ while generation stays fast. `rng` keeps it
   deterministic. */
export function generatePuzzle(difficulty = 'medium', seed) {
  const rng = createRng(seed);
  const solution = generateSolved(seed);
  const puzzle = [...solution];
  const target = CLUES[difficulty] ?? CLUES.medium;
  let clues = SIDE * SIDE;
  const order = rng.shuffle([...Array(SIDE * SIDE).keys()]);
  // Each removal costs a uniqueness check; bound the work so hard boards still
  // generate in a few tens of milliseconds.
  let budget = 400;
  let progress = true;
  while (clues > target && progress && budget > 0) {
    progress = false;
    for (const index of order) {
      if (clues <= target || budget <= 0) break;
      const mirror = SIDE * SIDE - 1 - index;
      const value = puzzle[index];
      if (!value) continue;
      const mirrorValue = mirror !== index ? puzzle[mirror] : 0;
      puzzle[index] = 0;
      if (mirrorValue) puzzle[mirror] = 0;
      budget -= 1;
      if (countSolutions([...puzzle]) !== 1) {
        puzzle[index] = value;
        if (mirrorValue) puzzle[mirror] = mirrorValue;
      } else {
        clues -= mirrorValue ? 2 : 1;
        progress = true;
      }
    }
  }
  return { puzzle, solution };
}
