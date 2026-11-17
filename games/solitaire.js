/*
 * CUSTOMIZE SOLITAIRE HERE
 * - Change makeDeck() to add suits or variants; change deal() for another layout.
 * - Change canMoveToTableau() and canMoveToFoundation() to customize the rules.
 * - render() controls card markup; CSS in styles.css controls card size and feel.
 * Supports draw-one or draw-three, double-tap auto-move, an auto-complete sweep,
 * a move counter, and dead-end detection for the "no moves left" prompt.
 */
const SUITS = ['♠', '♥', '♦', '♣'];
import { HINT_COST, hintButton } from './hints.js';
import { createRng } from '../rng.js';

export const metadata = {
  id: 'solitaire',
  title: 'Solitaire',
  kind: 'cards',
  subtitle: 'A classic, one card at a time',
  art: 'cards',
  description: 'Build each suit from Ace to King. Drag a card or tap a card and its destination.'
};

function makeDeck(rng) {
  const cards = SUITS.flatMap(suit => Array.from({ length: 13 }, (_, index) => ({ rank: index + 1, suit })));
  return rng ? rng.shuffle(cards) : shuffle(cards);
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function createState({ seed, draw = 1 } = {}) {
  const rng = seed !== undefined && seed !== null && seed !== '' ? createRng(seed) : null;
  const deck = makeDeck(rng);
  const tableau = Array.from({ length: 7 }, (_, index) => deck.splice(0, index + 1).map((card, cardIndex) => ({ ...card, faceDown: cardIndex !== index })));
  return {
    draw: draw === 3 ? 3 : 1,
    tableau,
    stock: deck,
    waste: [],
    foundations: [[], [], [], []],
    selected: null,
    drag: null,
    hint: null,
    suppressClick: false,
    moves: 0,
    lastTap: null,
    finished: false
  };
}

function isRed(card) { return card.suit === '♥' || card.suit === '♦'; }
function cardLabel(card) { return `${card.rank === 1 ? 'A' : card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : card.rank}${card.suit}`; }

function selectedCards(state) {
  if (!state.selected) return [];
  if (state.selected.from === 'waste') return state.waste.length ? [state.waste.at(-1)] : [];
  return state.tableau[state.selected.pile].slice(state.selected.index);
}

function isValidRun(cards) {
  return cards.length > 0 && cards.every((card, index) => !card.faceDown && (!index || (cards[index - 1].rank === card.rank + 1 && isRed(cards[index - 1]) !== isRed(card))));
}

function canMoveToTableau(cards, target) {
  if (!isValidRun(cards)) return false;
  if (!target) return cards[0].rank === 13;
  return target.rank === cards[0].rank + 1 && isRed(target) !== isRed(cards[0]);
}

function canMoveToFoundation(foundation, card) {
  return foundation.length
    ? foundation.at(-1).suit === card.suit && foundation.at(-1).rank + 1 === card.rank
    : card.rank === 1;
}

function revealSourceTop(state, source) {
  if (source.from !== 'tableau') return;
  const pile = state.tableau[source.pile];
  if (pile.length) pile.at(-1).faceDown = false;
}

function takeSelected(state) {
  const source = state.selected;
  if (!source) return [];
  if (source.from === 'waste') return state.waste.splice(state.waste.length - 1, 1);
  const cards = state.tableau[source.pile].splice(source.index);
  revealSourceTop(state, source);
  return cards;
}

function finishIfWon(state, complete) {
  if (state.foundations.every(pile => pile.length === 13) && !state.finished) {
    state.finished = true;
    complete('solitaire');
  }
}

/* Any card that could still be moved to a foundation right now. Used by both
   auto-complete and the "no moves left" check. */
function safeFoundationMove(state) {
  const candidates = [];
  if (state.waste.length) candidates.push({ from: 'waste', card: state.waste.at(-1) });
  state.tableau.forEach((pile, pileIndex) => {
    const card = pile.at(-1);
    if (card && !card.faceDown) candidates.push({ from: 'tableau', pile: pileIndex, card });
  });
  return candidates.find(candidate => state.foundations.some(pile => canMoveToFoundation(pile, candidate.card))) ?? null;
}

export function hasMovesLeft(state) {
  if (state.stock.length || state.waste.length) return true;
  if (safeFoundationMove(state)) return true;
  const sources = [];
  if (state.waste.length) sources.push([state.waste.at(-1)]);
  state.tableau.forEach(pile => {
    for (let index = 0; index < pile.length; index++) {
      const cards = pile.slice(index);
      if (isValidRun(cards)) sources.push(cards);
    }
  });
  return sources.some(cards => state.tableau.some((pile, pileIndex) => {
    if (!canMoveToTableau(cards, pile.at(-1))) return false;
    // A single card already on top of a valid pile isn't progress.
    return !(cards.length === 1 && pile.at(-1) === cards[0]);
  }));
}

/* Pull every card that is safe to send home, revealing cards as it goes. */
export function autoComplete(state, complete = () => {}) {
  let moved = 0;
  let progress = true;
  while (progress) {
    progress = false;
    const candidate = safeFoundationMove(state);
    if (!candidate) break;
    const foundationIndex = state.foundations.findIndex(pile => canMoveToFoundation(pile, candidate.card));
    if (foundationIndex < 0) break;
    const cards = candidate.from === 'waste'
      ? state.waste.splice(state.waste.length - 1, 1)
      : state.tableau[candidate.pile].splice(state.tableau[candidate.pile].length - 1, 1);
    state.foundations[foundationIndex].push(...cards);
    if (candidate.from === 'tableau') revealSourceTop(state, candidate);
    moved += 1;
    progress = true;
  }
  if (moved) { state.moves += moved; state.selected = null; finishIfWon(state, complete); }
  return moved;
}

function findHint(state) {
  const sources = [];
  if (state.waste.length) sources.push({ from: 'waste', cards: [state.waste.at(-1)] });
  for (let pile = 0; pile < state.tableau.length; pile++) {
    for (let index = 0; index < state.tableau[pile].length; index++) {
      const cards = state.tableau[pile].slice(index);
      if (isValidRun(cards)) sources.push({ from: 'tableau', pile, index, cards });
    }
  }
  for (const source of sources) {
    if (source.cards.length === 1) {
      const card = source.cards[0];
      const foundation = state.foundations.findIndex(pile => canMoveToFoundation(pile, card));
      if (foundation >= 0) return { ...source, cards: undefined, destination: { type: 'foundation', index: foundation } };
    }
    for (let pile = 0; pile < state.tableau.length; pile++) {
      if (source.from === 'tableau' && source.pile === pile) continue;
      if (canMoveToTableau(source.cards, state.tableau[pile].at(-1))) {
        return { ...source, cards: undefined, destination: { type: 'tableau', index: pile } };
      }
    }
  }
  if (state.stock.length || state.waste.length) return { from: 'stock' };
  return null;
}

function moveToTableau(state, pileIndex, helpers) {
  if (!state.selected) return false;
  if (state.selected.from === 'tableau' && state.selected.pile === pileIndex) return false;
  const cards = selectedCards(state);
  const target = state.tableau[pileIndex].at(-1);
  if (!canMoveToTableau(cards, target)) {
    helpers.toast('That pile needs a King, or a lower card of the opposite color.');
    state.selected = null;
    return true;
  }
  state.tableau[pileIndex].push(...takeSelected(state));
  state.selected = null;
  state.moves += 1;
  return { changed: true, undoable: true };
}

function moveToFoundation(state, foundationIndex, helpers) {
  const cards = selectedCards(state);
  if (!state.selected || cards.length !== 1) {
    helpers.toast('Move one card at a time to a foundation.');
    return true;
  }
  const card = cards[0];
  if (!canMoveToFoundation(state.foundations[foundationIndex], card)) {
    helpers.toast('Start a foundation with an Ace, then build the same suit.');
    state.selected = null;
    return true;
  }
  state.foundations[foundationIndex].push(...takeSelected(state));
  state.selected = null;
  state.moves += 1;
  finishIfWon(state, helpers.complete);
  return { changed: true, undoable: true };
}

function drawStock(state) {
  const count = state.draw;
  for (let index = 0; index < count && state.stock.length; index++) {
    const card = state.stock.pop();
    if (card) state.waste.push({ ...card, faceDown: false });
  }
  state.moves += 1;
  state.selected = null;
}

export function render(state, { cardBack = 'meadow', credits = 0 } = {}) {
  const wasteShown = state.waste.slice(-state.draw);
  const stock = state.stock.length
    ? `<button class="stock-button ${state.hint?.from === 'stock' ? 'is-hint-source' : ''}" data-stock aria-label="Draw ${state.draw} card${state.draw > 1 ? 's' : ''}"><span class="deck-back pack-${cardBack}" aria-hidden="true">✳</span><small class="stock-count">${state.stock.length}</small></button>`
    : `<button class="stock-button ${state.hint?.from === 'stock' ? 'is-hint-source' : ''}" data-recycle aria-label="Recycle waste">↶</button>`;
  const waste = wasteShown.map((card, index) => {
    const isTop = index === wasteShown.length - 1;
    return `<button class="waste-card ${isTop ? 'is-top' : ''}" ${isTop ? 'data-waste-card' : 'data-waste-static'} aria-label="${isTop ? 'Select waste pile' : cardLabel(card)}">${cardLabel(card)}</button>`;
  }).join('') || '·';
  const top = `<div class="solitaire-top"><div>${stock}</div><div class="waste-stack">${waste}</div><div></div>${state.foundations.map((pile, index) => `<button class="pile-mark ${state.hint?.destination?.type === 'foundation' && state.hint.destination.index === index ? 'is-hint-target' : ''}" data-foundation="${index}" aria-label="Foundation ${index + 1}">${pile.length ? cardLabel(pile.at(-1)) : '♧'}</button>`).join('')}</div>`;
  const columns = state.tableau.map((pile, pileIndex) => `<div class="card-pile ${state.hint?.destination?.type === 'tableau' && state.hint.destination.index === pileIndex ? 'is-hint-target' : ''}" data-pile="${pileIndex}">${pile.length ? pile.map((card, cardIndex) => {
    const selected = state.selected?.from === 'tableau' && state.selected.pile === pileIndex && cardIndex >= state.selected.index;
    const hintedSource = state.hint?.from === 'tableau' && state.hint.pile === pileIndex && cardIndex === state.hint.index;
    const isTop = cardIndex === pile.length - 1 && !card.faceDown;
    return `<button class="playing-card ${isRed(card) ? 'red' : ''} ${card.faceDown ? `is-face-down card-back pack-${cardBack}` : 'is-selectable'} ${isTop ? 'is-top' : ''} ${selected ? 'is-selected' : ''} ${hintedSource ? 'is-hint-source' : ''}" style="z-index:${cardIndex}" data-card-pile="${pileIndex}" data-card-index="${cardIndex}" aria-label="${card.faceDown ? 'Face-down card' : cardLabel(card)}" ${card.faceDown ? 'disabled' : ''}>${card.faceDown ? '✳' : cardLabel(card)}</button>`;
  }).join('') : '<span class="pile-mark">♧</span>'}</div>`).join('');
  const selectedCard = selectedCards(state)[0];
  const selectedLabel = selectedCard ? `Selected ${cardLabel(selectedCard)}. ` : '';
  const drawControl = `<label class="difficulty-control"><span>Draw</span><select data-solitaire-draw aria-label="Cards drawn from stock">${[1, 3].map(count => `<option value="${count}" ${state.draw === count ? 'selected' : ''}>${count === 1 ? 'One' : 'Three'}</option>`).join('')}</select></label>`;
  const deadEnd = !state.finished && !hasMovesLeft(state);
  const banner = state.finished
    ? '<p class="game-banner is-win">Every suit is home. Nicely played.</p>'
    : deadEnd
      ? '<p class="game-banner is-stuck">No moves remain and the stock is empty. Start a new deal to keep playing.</p>'
      : '';
  return {
    board: `<div class="solitaire-board ${state.finished ? 'is-complete' : ''}">${top}${columns}</div>`,
    aside: `${banner}<p class="aside-label">KLONDIKE · DRAW ${state.draw === 1 ? 'ONE' : 'THREE'} · ${state.moves} MOVES</p><h2 class="aside-title">Make room for a King</h2><p class="aside-copy">${selectedLabel}Drag a face-up card or tap it, then tap a destination. Double-tap a card to send it straight home. Build down in alternating colors; foundations go up by suit.</p>${drawControl}${hintButton('Find a legal move', { credits, finished: state.finished })}<button class="game-action" data-auto-foundation>Send selected card home</button><button class="game-action" data-auto-complete>Auto-complete</button><div class="reward-line"><span>Clear all four suits</span><strong>+25 credits<br>+50 XP</strong></div>`
  };
}

export function handleClick(target, state, helpers) {
  if (target.closest('[data-game-hint]')) {
    const hint = findHint(state);
    if (!hint) { helpers.toast('No legal moves remain. Try drawing from stock.'); return true; }
    if (!helpers.spendCredits(HINT_COST)) return true;
    state.hint = hint;
    state.selected = null;
    return true;
  }
  if (target.closest('[data-auto-complete]')) {
    const moved = autoComplete(state, helpers.complete);
    helpers.toast(moved ? `Sent ${moved} card${moved > 1 ? 's' : ''} home.` : 'No card is ready to go home yet.');
    return moved > 0 ? { changed: true, undoable: true } : true;
  }
  state.hint = null;
  if (state.suppressClick) {
    state.suppressClick = false;
    return true;
  }
  if (target.closest('[data-stock]')) {
    drawStock(state);
    return { changed: true, undoable: true };
  }
  if (target.closest('[data-recycle]')) {
    // Flip the waste back onto the stock so the oldest waste card is drawn next.
    state.stock = [...state.stock, ...state.waste.reverse().map(card => ({ ...card, faceDown: true }))];
    state.waste = [];
    state.selected = null;
    state.moves += 1;
    return { changed: true, undoable: true };
  }
  if (target.closest('[data-auto-foundation]')) {
    const card = selectedCards(state)[0];
    if (!card) { helpers.toast('Select a card first.'); return true; }
    const destination = state.foundations.findIndex(pile => canMoveToFoundation(pile, card));
    if (destination < 0) { helpers.toast('That card is not ready for a foundation.'); return true; }
    return moveToFoundation(state, destination, helpers);
  }
  const foundation = target.closest('[data-foundation]');
  if (foundation) return moveToFoundation(state, Number(foundation.dataset.foundation), helpers);
  const card = target.closest('[data-card-pile]');
  const pile = target.closest('[data-pile]');
  if (card) {
    const pileIndex = Number(card.dataset.cardPile);
    const cardIndex = Number(card.dataset.cardIndex);
    const now = Date.now();
    const doubleTap = state.lastTap && state.lastTap.pile === pileIndex && state.lastTap.index === cardIndex && now - state.lastTap.time < 350;
    state.lastTap = { pile: pileIndex, index: cardIndex, time: now };
    if (doubleTap) {
      state.selected = { from: 'tableau', pile: pileIndex, index: cardIndex };
      const cards = selectedCards(state);
      if (cards.length === 1) {
        const destination = state.foundations.findIndex(item => canMoveToFoundation(item, cards[0]));
        if (destination >= 0) { moveToFoundation(state, destination, helpers); return true; }
      }
      state.selected = null;
      return true;
    }
    if (state.selected && state.selected.from === 'tableau' && state.selected.pile === pileIndex && state.selected.index === cardIndex) state.selected = null;
    else if (state.selected && !(state.selected.from === 'tableau' && state.selected.pile === pileIndex)) moveToTableau(state, pileIndex, helpers);
    else state.selected = { from: 'tableau', pile: pileIndex, index: cardIndex };
    return true;
  }
  if (target.closest('[data-waste-card]')) {
    if (state.waste.length) state.selected = state.selected?.from === 'waste' ? null : { from: 'waste' };
    return true;
  }
  if (pile) return moveToTableau(state, Number(pile.dataset.pile), helpers);
  return false;
}

export function handlePointerDown(event, state) {
  const card = event.target.closest?.('[data-card-pile], [data-waste-card]');
  if (!card || event.button !== 0) return;
  const waste = card.matches('[data-waste-card]');
  if (waste && !state.waste.length) return;
  const source = waste
    ? { from: 'waste' }
    : { from: 'tableau', pile: Number(card.dataset.cardPile), index: Number(card.dataset.cardIndex) };
  if (!waste && state.tableau[source.pile][source.index].faceDown) return;
  state.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, source, moved: false, element: card };
}

export function handlePointerMove(event, state) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7) {
    drag.moved = true;
    state.selected = drag.source;
    drag.element.classList.add('is-dragging');
  }
  if (!drag.moved) return;
  const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pile], [data-foundation]');
  document.querySelectorAll('.drop-target').forEach(target => target.classList.remove('drop-target'));
  element?.classList.add('drop-target');
  drag.element.style.transform = `translate(${event.clientX - drag.x}px, ${event.clientY - drag.y}px)`;
}

export function handlePointerUp(event, state, helpers) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return false;
  state.drag = null;
  document.querySelectorAll('.drop-target').forEach(target => target.classList.remove('drop-target'));
  if (!drag.moved) return false;
  const destination = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pile], [data-foundation]');
  drag.element.classList.remove('is-dragging');
  drag.element.style.transform = '';
  state.selected = drag.source;
  state.suppressClick = true;
  let result = true;
  if (destination?.hasAttribute('data-foundation')) result = moveToFoundation(state, Number(destination.dataset.foundation), helpers);
  else if (destination?.hasAttribute('data-pile')) result = moveToTableau(state, Number(destination.dataset.pile), helpers);
  else state.selected = null;
  return result === true ? true : { changed: true, undoable: true };
}

export function handlePointerCancel(event, state) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return false;
  state.drag.element.classList.remove('is-dragging');
  state.drag.element.style.transform = '';
  state.drag = null;
  state.selected = null;
  state.suppressClick = true;
  return true;
}

export default { metadata, createState, render, handleClick, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, autoComplete, hasMovesLeft };
