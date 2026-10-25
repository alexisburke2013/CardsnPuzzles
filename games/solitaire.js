/*
 * CUSTOMIZE SOLITAIRE HERE
 * - Change makeDeck() to add suits or variants; change deal() for another layout.
 * - Change canMoveToTableau() and canMoveToFoundation() to customize the rules.
 * - render() controls card markup; CSS in styles.css controls card size, feel, and animation.
 */
const SUITS = ['♠', '♥', '♦', '♣'];

export const metadata = {
  id: 'solitaire',
  title: 'Solitaire',
  kind: 'cards',
  subtitle: 'A classic, one card at a time',
  art: 'cards',
  description: 'Build each suit from Ace to King. Drag a card or tap a card and its destination.'
};

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function makeDeck() {
  return shuffle(SUITS.flatMap(suit => Array.from({ length: 13 }, (_, index) => ({ rank: index + 1, suit }))));
}

export function createState() {
  const deck = makeDeck();
  const tableau = Array.from({ length: 7 }, (_, index) => deck.splice(0, index + 1).map((card, cardIndex) => ({ ...card, faceDown: cardIndex !== index })));
  return { tableau, stock: deck, waste: [], foundations: [[], [], [], []], selected: null, drag: null, suppressClick: false, finished: false };
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
  return true;
}

function moveToFoundation(state, foundationIndex, helpers) {
  const cards = selectedCards(state);
  if (!state.selected || cards.length !== 1) {
    helpers.toast('Move one card at a time to a foundation.');
    return true;
  }
  const card = cards[0];
  const foundation = state.foundations[foundationIndex];
  const valid = foundation.length
    ? foundation.at(-1).suit === card.suit && foundation.at(-1).rank + 1 === card.rank
    : card.rank === 1;
  if (!valid) {
    helpers.toast('Start a foundation with an Ace, then build the same suit.');
    state.selected = null;
    return true;
  }
  foundation.push(...takeSelected(state));
  state.selected = null;
  finishIfWon(state, helpers.complete);
  return true;
}

export function render(state, { cardBack = 'meadow' } = {}) {
  const stock = state.stock.length
    ? `<button class="stock-button" data-stock aria-label="Draw a card"><span class="deck-back pack-${cardBack}" aria-hidden="true">✳</span></button>`
    : '<button class="stock-button" data-recycle aria-label="Recycle waste">↶</button>';
  const top = `<div class="solitaire-top"><div>${stock}</div><div><button class="waste-card" data-waste-card aria-label="Select waste pile">${state.waste.length ? cardLabel(state.waste.at(-1)) : '·'}</button></div><div></div>${state.foundations.map((pile, index) => `<button class="pile-mark" data-foundation="${index}" aria-label="Foundation ${index + 1}">${pile.length ? cardLabel(pile.at(-1)) : '♧'}</button>`).join('')}</div>`;
  const columns = state.tableau.map((pile, pileIndex) => `<div class="card-pile" data-pile="${pileIndex}">${pile.length ? pile.map((card, cardIndex) => {
    const selected = state.selected?.from === 'tableau' && state.selected.pile === pileIndex && cardIndex >= state.selected.index;
    return `<button class="playing-card ${isRed(card) ? 'red' : ''} ${card.faceDown ? `is-face-down card-back pack-${cardBack}` : 'is-selectable'} ${selected ? 'is-selected' : ''}" style="z-index:${cardIndex}" data-card-pile="${pileIndex}" data-card-index="${cardIndex}" aria-label="${card.faceDown ? 'Face-down card' : cardLabel(card)}" ${card.faceDown ? 'disabled' : ''}>${card.faceDown ? '✳' : cardLabel(card)}</button>`;
  }).join('') : '<span class="pile-mark">♧</span>'}</div>`).join('');
  const selectedCard = selectedCards(state)[0];
  const selectedLabel = selectedCard ? `Selected ${cardLabel(selectedCard)}. ` : '';
  return {
    board: `<div class="solitaire-board">${top}${columns}</div>`,
    aside: `<p class="aside-label">KLONDIKE · DRAW ONE</p><h2 class="aside-title">Make room for a King</h2><p class="aside-copy">${selectedLabel}Drag a face-up card or tap it, then tap a destination. Move a stack by starting on any face-up card. Build down in alternating colors; foundations go up by suit.</p><button class="game-action" data-auto-foundation>Send selected card home</button><div class="reward-line"><span>Clear all four suits</span><strong>+25 points<br>+50 XP</strong></div>`
  };
}

export function handleClick(target, state, helpers) {
  if (state.suppressClick) {
    state.suppressClick = false;
    return true;
  }
  if (target.closest('[data-stock]')) {
    const card = state.stock.pop();
    if (card) state.waste.push({ ...card, faceDown: false });
    state.selected = null;
    return true;
  }
  if (target.closest('[data-recycle]')) {
    state.stock = state.waste.reverse().map(card => ({ ...card, faceDown: true }));
    state.waste = [];
    state.selected = null;
    return true;
  }
  if (target.closest('[data-auto-foundation]')) {
    const card = selectedCards(state)[0];
    if (!card) { helpers.toast('Select a card first.'); return true; }
    const destination = state.foundations.findIndex(pile => pile.length
      ? pile.at(-1).suit === card.suit && pile.at(-1).rank + 1 === card.rank
      : card.rank === 1);
    if (destination < 0) helpers.toast('That card is not ready for a foundation.');
    else moveToFoundation(state, destination, helpers);
    return true;
  }
  const foundation = target.closest('[data-foundation]');
  if (foundation) return moveToFoundation(state, Number(foundation.dataset.foundation), helpers);
  const card = target.closest('[data-card-pile]');
  const pile = target.closest('[data-pile]');
  if (card) {
    const pileIndex = Number(card.dataset.cardPile);
    const cardIndex = Number(card.dataset.cardIndex);
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
  if (destination?.hasAttribute('data-foundation')) moveToFoundation(state, Number(destination.dataset.foundation), helpers);
  else if (destination?.hasAttribute('data-pile')) moveToTableau(state, Number(destination.dataset.pile), helpers);
  else state.selected = null;
  return true;
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

export default { metadata, createState, render, handleClick, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel };