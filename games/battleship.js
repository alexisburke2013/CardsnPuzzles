/*
 * CUSTOMIZE BATTLESHIPS HERE
 * - Change FLEET for a different set of ships (name + length). The board size is
 *   GRID below; keep the fleet small enough to fit.
 * - Change DIFFICULTIES to tune the computer opponent. 'easy' fires at random,
 *   'medium' chases a ship after a hit, and 'hard' also sweeps a checkerboard
 *   pattern so it wastes fewer shots.
 * Two modes: 'ai' plays against the computer, 'hotseat' passes the device
 * between two people. Placement is tap-to-place with a rotate toggle, plus
 * Auto-place and Clear. Every placement and shot is deterministic when a seed
 * is supplied, so a shared or daily board rebuilds exactly.
 */
import { createRng } from '../rng.js';
import { HINT_COST, hintButton } from './hints.js';

export const GRID = { rows: 8, columns: 8 };

export const FLEET = [
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
  { name: 'Patrol', size: 2 }
];

export const DIFFICULTIES = {
  easy: { label: 'Easy', targeting: false, parity: false },
  medium: { label: 'Medium', targeting: true, parity: false },
  hard: { label: 'Hard', targeting: true, parity: true }
};

export const MODES = {
  ai: { label: 'Vs computer' },
  hotseat: { label: 'Two players' }
};

export const metadata = {
  id: 'battleship',
  title: 'Battleships',
  kind: 'puzzles',
  subtitle: 'Sink the fleet',
  art: 'tiles',
  description: 'Hide your fleet, then take turns firing at the enemy grid. Mark every ship sunk to win.'
};

function allIndices(rows, columns) {
  return Array.from({ length: rows * columns }, (_, index) => index);
}

/* Orthogonal neighbours only: Battleships ships are straight lines, so diagonal
   cells never share a ship. Used by the computer to chase a hit. */
function neighbours(index, rows, columns) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const result = [];
  if (row > 0) result.push(index - columns);
  if (row < rows - 1) result.push(index + columns);
  if (column > 0) result.push(index - 1);
  if (column < columns - 1) result.push(index + 1);
  return result;
}

function emptyBoard() {
  return { ships: [], shots: {} };
}

export function createState({ mode = 'ai', difficulty = 'medium', seed } = {}) {
  const level = DIFFICULTIES[difficulty] ? difficulty : 'medium';
  const play = MODES[mode] ? mode : 'ai';
  return {
    mode: play,
    difficulty: level,
    rows: GRID.rows,
    columns: GRID.columns,
    phase: 'placing',
    placing: { player: 'p1', orientation: 'h' },
    boards: { p1: emptyBoard(), p2: emptyBoard() },
    turn: 'p1',
    winner: null,
    finished: false,
    handoff: false,
    lastShot: null,
    ai: { queue: [] },
    aiShots: 0,
    shots: 0,
    hits: 0,
    moves: 0,
    seed: seed ?? null,
    rewarded: false
  };
}

function occupiedCells(board) {
  const set = new Set();
  board.ships.forEach(ship => ship.cells.forEach(cell => set.add(cell)));
  return set;
}

/* The cells a ship of `size` would cover from `start`, or null when it would
   fall off the board or overlap a placed ship. */
export function canPlace(board, size, start, orientation, rows = GRID.rows, columns = GRID.columns) {
  const row = Math.floor(start / columns);
  const column = start % columns;
  if (orientation === 'h' && column + size > columns) return null;
  if (orientation === 'v' && row + size > rows) return null;
  const cells = [];
  for (let step = 0; step < size; step++) cells.push(orientation === 'h' ? start + step : start + step * columns);
  const taken = occupiedCells(board);
  if (cells.some(cell => taken.has(cell))) return null;
  return cells;
}

export function placeShip(board, name, size, start, orientation, rows = GRID.rows, columns = GRID.columns) {
  const cells = canPlace(board, size, start, orientation, rows, columns);
  if (!cells) return null;
  const ship = { id: board.ships.length, name, size, cells, hits: 0, orientation };
  board.ships.push(ship);
  return ship;
}

/* Fill a board with every fleet ship at random legal positions. Retries a
   bounded number of times per ship so a bad seed cannot spin forever. */
export function autoPlace(board, rng, { rows = GRID.rows, columns = GRID.columns, fleet = FLEET } = {}) {
  for (const ship of fleet) {
    let placed = null;
    for (let attempt = 0; attempt < 200 && !placed; attempt++) {
      const start = rng.int(rows * columns);
      const orientation = rng.next() < 0.5 ? 'h' : 'v';
      placed = placeShip(board, ship.name, ship.size, start, orientation, rows, columns);
    }
    if (!placed) return false;
  }
  return true;
}

export function clearBoard(board) {
  board.ships = [];
  board.shots = {};
}

/* The first square where the next ship fits, scanning row by row. Advisory only;
   used by the placement hint. */
export function suggestPlacement(state, board, size) {
  for (const orientation of [state.placing.orientation, state.placing.orientation === 'h' ? 'v' : 'h']) {
    for (const index of allIndices(state.rows, state.columns)) {
      if (canPlace(board, size, index, orientation, state.rows, state.columns)) return index;
    }
  }
  return null;
}

export function allSunk(board) {
  return board.ships.length > 0 && board.ships.every(ship => ship.hits >= ship.size);
}

/* Fire at a cell. Returns 'miss', 'hit', or 'sunk', or null when the cell was
   already fired at. */
export function fire(board, index) {
  if (board.shots[index] !== undefined) return null;
  const ship = board.ships.find(candidate => candidate.cells.includes(index));
  if (!ship) {
    board.shots[index] = 'miss';
    return 'miss';
  }
  ship.hits += 1;
  const sunk = ship.hits >= ship.size;
  board.shots[index] = sunk ? 'sunk' : 'hit';
  if (sunk) ship.cells.forEach(cell => { board.shots[cell] = 'sunk'; });
  return sunk ? 'sunk' : 'hit';
}

function unshot(board, indices) {
  return indices.filter(index => board.shots[index] === undefined);
}

/* The computer picks its next shot at `board`. Hard mode hunts on a checkerboard
   parity (a ship of length two or more must touch one parity square), then chases
   the queue of neighbours opened up by a hit. */
export function aiChooseShot(state, rng, board = state.boards.p1) {
  const config = DIFFICULTIES[state.difficulty];
  const open = unshot(board, allIndices(state.rows, state.columns));
  if (!open.length) return null;
  if (config.targeting) {
    state.ai.queue = unshot(board, state.ai.queue);
    if (state.ai.queue.length) return state.ai.queue.shift();
  }
  const pool = config.parity
    ? open.filter(index => (Math.floor(index / state.columns) + (index % state.columns)) % 2 === 0)
    : open;
  return rng.pick(pool.length ? pool : open);
}

/* After a shot, queue the orthogonal neighbours of a fresh hit so the computer
   finishes a wounded ship before hunting again. A sunk ship clears the queue. */
function aiTrack(state, board, index, result) {
  if (!DIFFICULTIES[state.difficulty].targeting) return;
  if (result === 'sunk') { state.ai.queue = []; return; }
  if (result !== 'hit') return;
  for (const cell of neighbours(index, state.rows, state.columns)) {
    if (board.shots[cell] === undefined) state.ai.queue.push(cell);
  }
}

function opponent(player) {
  return player === 'p1' ? 'p2' : 'p1';
}

function finish(state, winner) {
  state.phase = 'over';
  state.winner = winner;
  state.finished = true;
}

function resolveShot(state, shooter, index) {
  const targetBoard = state.boards[opponent(shooter)];
  const result = fire(targetBoard, index);
  if (result === null) return null;
  state.shots += 1;
  if (result !== 'miss') state.hits += 1;
  state.moves += 1;
  state.lastShot = { by: shooter, index, result };
  if (allSunk(targetBoard)) {
    finish(state, shooter);
    return result;
  }
  state.turn = opponent(shooter);
  if (state.mode === 'hotseat') state.handoff = true;
  return result;
}

function aiTurn(state, helpers) {
  if (state.phase !== 'battle' || state.mode !== 'ai' || state.turn !== 'p2') return;
  const rng = createRng(state.seed ? `${state.seed}:ai:${state.aiShots}` : undefined);
  const index = aiChooseShot(state, rng);
  if (index === null) return;
  const result = fire(state.boards.p1, index);
  state.aiShots += 1;
  state.shots += 1;
  if (result !== 'miss') state.hits += 1;
  state.lastShot = { by: 'p2', index, result };
  aiTrack(state, state.boards.p1, index, result);
  if (allSunk(state.boards.p1)) {
    finish(state, 'p2');
    helpers?.rerender?.();
    return;
  }
  state.turn = 'p1';
  helpers?.rerender?.();
}

function sunkSet(board) {
  const set = new Set();
  board.ships.forEach(ship => { if (ship.hits >= ship.size) ship.cells.forEach(cell => set.add(cell)); });
  return set;
}

function shipLabel(size) {
  return FLEET.find(ship => ship.size === size)?.name ?? `${size}`;
}

function ownCells(state, board) {
  const sunk = sunkSet(board);
  return allIndices(state.rows, state.columns).map(index => {
    const shot = board.shots[index];
    const ship = board.ships.find(candidate => candidate.cells.includes(index));
    const classes = ['bs-cell'];
    if (ship) classes.push(sunk.has(index) ? 'is-sunk' : 'is-ship');
    if (shot) classes.push(`is-${shot}`);
    const label = ship ? `${ship.name}${shot ? `, ${shot}` : ''}` : shot === 'miss' ? 'miss' : 'water';
    return `<div class="${classes.join(' ')}" role="img" aria-label="Square ${index + 1}, ${label}"></div>`;
  }).join('');
}

function enemyCells(state, board, { interactive }) {
  const sunk = sunkSet(board);
  return allIndices(state.rows, state.columns).map(index => {
    const shot = board.shots[index];
    const classes = ['bs-cell'];
    if (sunk.has(index)) classes.push('is-sunk');
    else if (shot === 'hit') classes.push('is-hit');
    else if (shot === 'miss') classes.push('is-miss');
    if (state.hint === index) classes.push('is-hinted');
    const label = shot ? (shot === 'miss' ? 'miss' : 'hit') : 'unknown';
    if (shot || !interactive) {
      return `<div class="${classes.join(' ')}" role="img" aria-label="Square ${index + 1}, ${label}">${shot === 'miss' ? '·' : shot ? '✕' : ''}</div>`;
    }
    return `<button class="${classes.join(' ')}" data-bs-fire="${index}" aria-label="Fire at square ${index + 1}">${''}</button>`;
  }).join('');
}

function placementControls(state, board) {
  const placed = board.ships.length;
  const next = FLEET[placed];
  const ready = placed >= FLEET.length;
  const list = FLEET.map((ship, index) => `<li class="${index < placed ? 'is-placed' : ''}${index === placed ? ' is-next' : ''}"><span>${ship.name}</span><small>${ship.size}</small></li>`).join('');
  return {
    board: `<div class="bs-board is-own" style="--bs-columns:${state.columns}">${allIndices(state.rows, state.columns).map(index => {
      const ship = board.ships.find(candidate => candidate.cells.includes(index));
      const hinted = state.hint === index;
      return `<button class="bs-cell ${ship ? 'is-ship' : ''} ${hinted ? 'is-hinted' : ''}" data-bs-place="${index}" aria-label="Place at square ${index + 1}${ship ? `, ${ship.name}` : ''}"></button>`;
    }).join('')}</div>
    <div class="bs-tools">
      <button class="bs-tool" data-bs-rotate aria-pressed="${state.placing.orientation === 'v'}">↻ Rotate (${state.placing.orientation === 'h' ? 'Across' : 'Down'})</button>
      <button class="bs-tool" data-bs-auto>Auto-place</button>
      <button class="bs-tool" data-bs-clear ${placed ? '' : 'disabled'}>Clear</button>
      <button class="bs-tool is-primary" data-bs-ready ${ready ? '' : 'disabled'}>Ready</button>
    </div>`,
    status: ready
      ? 'Fleet placed. Tap Ready to start the battle.'
      : `Place the ${next.name} (${next.size}) — tap a square, or rotate to change direction.`,
    list
  };
}

function renderPlacement(state, credits) {
  const board = state.boards[state.placing.player];
  const { board: grid, status, list } = placementControls(state, board);
  const who = state.mode === 'hotseat' ? (state.placing.player === 'p1' ? 'Player 1' : 'Player 2') : 'Your fleet';
  return {
    board: grid,
    aside: `<p class="aside-label">BATTLESHIPS · PLACE YOUR FLEET</p><h2 class="aside-title">${who}</h2><p class="aside-copy">${status} Ships cannot touch the edge of the grid. A ship only sinks when every one of its squares is hit.</p><ul class="bs-fleet">${list}</ul>${modeControls(state)}${hintButton('Suggest a square', { credits, finished: false })}<div class="reward-line"><span>Sink the fleet</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

function modeControls(state) {
  return `<div class="bs-selects">
    <label class="difficulty-control"><span>Mode</span><select data-bs-mode aria-label="Game mode">${Object.entries(MODES).map(([id, item]) => `<option value="${id}" ${state.mode === id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
    <label class="difficulty-control"><span>Opponent</span><select data-bs-difficulty aria-label="Opponent difficulty" ${state.mode === 'hotseat' ? 'disabled' : ''}>${Object.entries(DIFFICULTIES).map(([id, item]) => `<option value="${id}" ${state.difficulty === id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
  </div>`;
}

function renderHandoff(state) {
  const next = state.placing.player === 'p2' && state.phase === 'placing' ? 'Player 2' : state.turn === 'p1' ? 'Player 1' : 'Player 2';
  const placing = state.phase === 'placing';
  return {
    board: `<div class="bs-handoff"><p class="bs-handoff-eyebrow">${placing ? 'PLACE FLEET' : 'NEXT TURN'}</p><h2>Pass the device to ${next}</h2><p>Keep your fleet hidden. Tap below when ${next} is ready.</p><button class="bs-tool is-primary" data-bs-resume>I am ${next}</button></div>`,
    aside: `<p class="aside-label">BATTLESHIPS · HOTSEAT</p><h2 class="aside-title">Two players</h2><p class="aside-copy">Take turns firing at the other player's fleet. Each turn fires one shot. The first player to sink every enemy ship wins.</p>`
  };
}

function renderBattle(state, credits) {
  // The human always views from one seat: p1 in AI mode, or whoever's turn it is
  // in hotseat. This keeps the computer's own fleet hidden during its turn.
  const viewer = state.mode === 'hotseat' ? state.turn : 'p1';
  const mine = state.boards[viewer];
  const theirs = state.boards[opponent(viewer)];
  const label = state.mode === 'hotseat' ? (viewer === 'p1' ? 'Player 1' : 'Player 2') : (state.turn === 'p1' ? 'Your turn' : 'Computer firing');
  const banner = state.phase === 'over'
    ? state.winner === 'p1'
      ? '<p class="game-banner is-win">Fleet destroyed. You win!</p>'
      : `<p class="game-banner is-stuck">${state.mode === 'hotseat' ? 'Player 2 sinks the fleet.' : 'Your fleet was sunk. Try again.'}</p>`
    : '';
  const shot = state.lastShot
    ? `<p class="bs-log">${state.lastShot.by === viewer ? 'You' : 'They'} fired at ${Math.floor(state.lastShot.index / state.columns) + 1}·${(state.lastShot.index % state.columns) + 1} — ${state.lastShot.result}.</p>`
    : '';
  const remaining = FLEET.length - theirs.ships.filter(ship => ship.hits >= ship.size).length;
  const interactive = state.phase === 'battle' && state.turn === viewer;
  return {
    board: `<div class="bs-field">
      <div class="bs-side"><p class="bs-side-label">${state.mode === 'hotseat' ? label + "'s fleet" : 'Your fleet'}</p><div class="bs-board is-own" style="--bs-columns:${state.columns}">${ownCells(state, mine)}</div></div>
      <div class="bs-side"><p class="bs-side-label">Enemy waters</p><div class="bs-board is-enemy" style="--bs-columns:${state.columns}">${enemyCells(state, theirs, { interactive })}</div></div>
    </div>`,
    aside: `${banner}<p class="aside-label">BATTLESHIPS · ${DIFFICULTIES[state.difficulty].label.toUpperCase()} · ${state.shots} SHOTS</p><h2 class="aside-title">${state.phase === 'over' ? 'Battle over' : label}</h2><p class="aside-copy">Tap a square in enemy waters to fire. ${state.mode === 'hotseat' ? 'Ships are hidden until sunk.' : 'The computer fires back after each of your shots.'} ${remaining} ${remaining === 1 ? 'ship' : 'ships'} still afloat.</p>${shot}${modeControls(state)}${state.phase === 'over' ? '' : hintButton('Suggest a shot', { credits, finished: false })}<div class="reward-line"><span>Sink the fleet</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

export function render(state, { credits = 0 } = {}) {
  if (state.handoff) return renderHandoff(state);
  if (state.phase === 'placing') return renderPlacement(state, credits);
  return renderBattle(state, credits);
}

function currentPlacer(state) {
  return state.placing.player;
}

/* Suggest the best square to fire at, using the same logic the computer uses
   when hunting: chase wounded ships first, then sweep the open parity squares.
   Purely advisory and never reveals where the enemy ships actually are. */
export function bestMove(state) {
  const board = state.boards[opponent(state.turn)];
  const open = unshot(board, allIndices(state.rows, state.columns));
  if (!open.length) return null;
  // Reuse the queue of squares adjacent to a confirmed hit.
  const chase = unshot(board, state.ai.queue);
  if (chase.length) return chase[0];
  const parity = open.filter(index => (Math.floor(index / state.columns) + (index % state.columns)) % 2 === 0);
  return (parity.length ? parity : open)[0];
}

export function handleClick(target, state, helpers) {
  const hint = target.closest?.('[data-game-hint]');
  if (hint) {
    if (!helpers.spendCredits(HINT_COST)) return true;
    if (state.phase === 'placing') {
      const board = state.boards[currentPlacer(state)];
      const next = FLEET[board.ships.length];
      const spot = next ? suggestPlacement(state, board, next.size) : null;
      state.hint = spot;
      helpers?.toast?.(spot === null ? 'The fleet is already placed.' : `Try square ${Math.floor(spot / state.columns) + 1}·${(spot % state.columns) + 1}.`);
      return { changed: true };
    }
    if (state.turn !== 'p1' && state.mode === 'ai') { helpers?.toast?.('Wait for the computer to finish its shot.'); return true; }
    const index = bestMove(state);
    if (index === null) { helpers?.toast?.('No squares left to fire at.'); return true; }
    state.hint = index;
    helpers?.toast?.(`Try firing at ${Math.floor(index / state.columns) + 1}·${(index % state.columns) + 1}.`);
    return { changed: true };
  }
  const rotate = target.closest?.('[data-bs-rotate]');
  if (rotate) {
    state.placing.orientation = state.placing.orientation === 'h' ? 'v' : 'h';
    return { changed: true };
  }
  if (target.closest?.('[data-bs-auto]')) {
    const board = state.boards[currentPlacer(state)];
    const remaining = { rows: state.rows, columns: state.columns, fleet: FLEET.slice(board.ships.length) };
    if (!autoPlace(board, createRng(state.seed ? `${state.seed}:auto:${board.ships.length}` : undefined), remaining)) {
      helpers?.toast?.('Could not fit the fleet. Clear and try again.');
    }
    return { changed: true, undoable: true };
  }
  if (target.closest?.('[data-bs-clear]')) {
    clearBoard(state.boards[currentPlacer(state)]);
    return { changed: true, undoable: true };
  }
  if (target.closest?.('[data-bs-ready]')) {
    return { changed: true, ...readyPlacement(state) };
  }
  const place = target.closest?.('[data-bs-place]');
  if (place && state.phase === 'placing') {
    const board = state.boards[currentPlacer(state)];
    const next = FLEET[board.ships.length];
    if (!next) return true;
    const index = Number(place.dataset.bsPlace);
    const ship = placeShip(board, next.name, next.size, index, state.placing.orientation, state.rows, state.columns);
    if (!ship) { helpers?.toast?.('That ship does not fit there.'); return true; }
    return { changed: true, undoable: true };
  }
  if (target.closest?.('[data-bs-resume]')) {
    state.handoff = false;
    return { changed: true };
  }
  const shotCell = target.closest?.('[data-bs-fire]');
  if (shotCell && state.phase === 'battle') {
    if (state.mode === 'ai' && state.turn !== 'p1') return true;
    const index = Number(shotCell.dataset.bsFire);
    const result = resolveShot(state, state.turn, index);
    if (result === null) return true;
    const solved = state.winner === 'p1' && !state.rewarded;
    if (state.mode === 'ai' && state.phase === 'battle' && state.turn === 'p2') {
      setTimeout(() => aiTurn(state, helpers), 320);
    }
    return { changed: true, solved };
  }
  return false;
}

/* Finish the current player's placement. In AI mode the computer's fleet is
   placed immediately; in hotseat play control passes to the second player. */
function readyPlacement(state) {
  const player = currentPlacer(state);
  const board = state.boards[player];
  if (board.ships.length < FLEET.length) return {};
  if (state.mode === 'ai') {
    autoPlace(state.boards.p2, createRng(state.seed ? `${state.seed}:enemy` : undefined), { rows: state.rows, columns: state.columns });
    state.phase = 'battle';
    state.turn = 'p1';
    return {};
  }
  if (player === 'p1') {
    state.placing = { player: 'p2', orientation: 'h' };
    state.handoff = true;
    return {};
  }
  state.phase = 'battle';
  state.turn = 'p1';
  state.handoff = true;
  return {};
}

export function checkSolved(state) {
  return Boolean(state.winner === 'p1' && !state.rewarded);
}

export default { metadata, createState, render, handleClick, checkSolved, canPlace, placeShip, autoPlace, clearBoard, fire, allSunk, aiChooseShot };
