/*
 * CUSTOMIZE MAHJONG HERE
 * - Change TILE_PAIRS to add or replace tile faces.
 * - Change makeLayout() to build a different board; keep each face in a pair.
 * - canSelect() contains the covered/blocked-side rules for this small layout.
 */
const TILE_PAIRS = ['●', '◆', '♣', '✳', '▲', '✦', '☼', '♥', '♪', '✿'];
import { HINT_COST, hintButton } from './hints.js';

export const metadata = {
  id: 'mahjong',
  title: 'Mahjong pairs',
  kind: 'puzzles',
  subtitle: 'Clear the layered tile garden',
  art: 'tiles',
  description: 'Match open pairs. Covered tiles and tiles blocked on both sides cannot be selected.'
};

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function makeLayout() {
  const faces = shuffle(TILE_PAIRS);
  const tiles = [];
  for (let row = 0; row < 4; row++) {
    const outside = faces[row];
    const inside = faces[row + 4];
    tiles.push({ id: tiles.length, row, column: 0, layer: 0, face: outside });
    tiles.push({ id: tiles.length, row, column: 1, layer: 0, face: inside });
    tiles.push({ id: tiles.length, row, column: 2, layer: 0, face: inside });
    tiles.push({ id: tiles.length, row, column: 3, layer: 0, face: outside });
  }
  tiles.push({ id: tiles.length, row: 1, column: 1, layer: 1, face: faces[8] });
  tiles.push({ id: tiles.length, row: 1, column: 2, layer: 1, face: faces[8] });
  tiles.push({ id: tiles.length, row: 2, column: 1, layer: 1, face: faces[9] });
  tiles.push({ id: tiles.length, row: 2, column: 2, layer: 1, face: faces[9] });
  return tiles;
}

export function createState() {
  return { tiles: makeLayout(), selected: null, hinted: [], finished: false };
}

function canSelect(tile, tiles) {
  if (tile.removed) return false;
  const above = tiles.some(other => !other.removed && other.layer > tile.layer && other.row === tile.row && other.column === tile.column);
  const leftBlocked = tiles.some(other => !other.removed && other.layer === tile.layer && other.row === tile.row && other.column === tile.column - 1);
  const rightBlocked = tiles.some(other => !other.removed && other.layer === tile.layer && other.row === tile.row && other.column === tile.column + 1);
  return !above && (!leftBlocked || !rightBlocked);
}

export function render(state, { credits = 0 } = {}) {
  const remaining = state.tiles.filter(tile => !tile.removed).length;
  const tiles = state.tiles.map(tile => {
    const selected = state.selected === tile.id;
    const hinted = state.hinted.includes(tile.id);
    const disabled = !canSelect(tile, state.tiles);
    const topOffset = tile.layer * -7;
    return `<button class="mahjong-tile ${selected ? 'is-selected' : ''} ${hinted ? 'is-hinted' : ''} ${disabled ? 'is-blocked' : ''}" style="grid-column:${tile.column + 1};grid-row:${tile.row + 1};z-index:${tile.layer * 10 + 1};--tile-lift:${topOffset}px" data-tile="${tile.id}" aria-label="${tile.face}${disabled ? ', blocked' : ''}" ${disabled ? 'disabled' : ''}>${tile.face}</button>`;
  }).join('');
  return {
    board: `<div class="mahjong-board" role="group" aria-label="Layered Mahjong matching board">${tiles}</div>`,
    aside: `<p class="aside-label">TILE GARDEN · ${remaining} LEFT</p><h2 class="aside-title">Clear the canopy</h2><p class="aside-copy">A tile opens when at least one side is clear. Clear the two canopy pairs to uncover the garden below.</p>${hintButton('Show an open pair', { credits, finished: state.finished })}<div class="reward-line"><span>Clear the garden</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

export function handleClick(target, state, helpers) {
  if (target.closest('[data-game-hint]')) {
    const available = state.tiles.filter(tile => canSelect(tile, state.tiles));
    const pair = available.find((tile, index) => available.slice(index + 1).some(other =>
      other.face === tile.face && !state.hinted.includes(tile.id) && !state.hinted.includes(other.id)));
    if (!pair) {
      if (state.hinted.length) helpers.toast('That pair is already highlighted.');
      else helpers.toast('No open pair remains. Start a fresh layout.');
      return true;
    }
    const match = available.find(tile => tile.id !== pair.id && tile.face === pair.face && !state.hinted.includes(tile.id));
    if (!match) { helpers.toast('That pair is already highlighted.'); return true; }
    if (!helpers.spendCredits(HINT_COST)) return true;
    state.hinted = [pair.id, match.id];
    state.selected = pair.id;
    return true;
  }
  const button = target.closest('[data-tile]');
  if (!button) return false;
  const tile = state.tiles.find(item => item.id === Number(button.dataset.tile));
  if (!tile || !canSelect(tile, state.tiles)) {
    helpers.toast('That tile is covered or blocked on both sides.');
    return true;
  }
  state.hinted = [];
  if (state.selected === null) state.selected = tile.id;
  else if (state.selected === tile.id) state.selected = null;
  else {
    const first = state.tiles.find(item => item.id === state.selected);
    if (first?.face === tile.face) {
      first.removed = true;
      tile.removed = true;
      state.selected = null;
      if (state.tiles.every(item => item.removed)) {
        state.finished = true;
        helpers.complete('mahjong');
      }
    } else {
      state.selected = tile.id;
      helpers.toast('Not a pair. The first tile stays highlighted.');
    }
  }
  return true;
}

export default { metadata, createState, render, handleClick };