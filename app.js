import { gameModules, comingSoonGames } from './games/index.js';

const STORAGE_KEY = 'playfield-save-v2';
const LEGACY_STORAGE_KEY = 'playfield-save-v1';
const gameCatalog = [...Object.values(gameModules).map(game => game.metadata), ...comingSoonGames];
const playableGames = Object.keys(gameModules);
const titles = [
  { name: 'Newcomer', level: 1 },
  { name: 'Curious Mind', level: 2 },
  { name: 'Quick Thinker', level: 4 },
  { name: 'Puzzle Keeper', level: 6 },
  { name: 'Master of Play', level: 8 }
];
const cardPacks = [
  { id: 'meadow', name: 'Meadow', level: 1 },
  { id: 'sunbeam', name: 'Sunbeam', level: 3 },
  { id: 'poppy', name: 'Poppy', level: 5 },
  { id: 'bluebird', name: 'Bluebird', level: 7 }
];
const defaultData = { profile: { xp: 0, points: 0, completed: [], gamesPlayed: 0, cardBack: 0 }, recent: 'sudoku', games: {} };
let data = loadData();
let activeGame = null;
let activeFilter = 'all';
let toastTimer;
let installPrompt = null;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY));
    if (!saved?.profile || ![1, 2].includes(saved.version)) return structuredClone(defaultData);
    const games = {};
    if (saved.version === 2) {
      for (const [id, state] of Object.entries(saved.games || {})) {
        if (id === 'sudoku' && state.givens?.length === 81) games[id] = state;
        if (id === 'solitaire' && state.tableau?.length === 7) games[id] = { ...state, selected: null, drag: null, suppressClick: false };
        if (id === 'mahjong' && state.tiles?.[0]?.face) games[id] = state;
        if (id === 'wordsearch' && Array.isArray(state.placements?.[0]) && typeof state.placements[0][0] === 'number') games[id] = state;
        if (id === 'crossword' && state.rows?.length === 5) games[id] = state;
      }
    }
    return { ...structuredClone(defaultData), ...saved, profile: { ...defaultData.profile, ...saved.profile }, games };
  } catch {
    return structuredClone(defaultData);
  }
}

function persist() {
  try {
    data.version = 2;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    updateProfile();
  } catch {
    showToast('This browser could not save progress. Check available storage.');
  }
}

function currentLevel() { return Math.floor(data.profile.xp / 100) + 1; }
function playerTitle() { return [...titles].reverse().find(title => currentLevel() >= title.level).name; }

function updateProfile() {
  const level = currentLevel();
  document.querySelector('#playerLevel').textContent = `Level ${level}`;
  document.querySelector('#playerTitle').textContent = playerTitle();
  document.querySelector('#coinCount').textContent = data.profile.points;
  document.querySelector('#xpCount').textContent = data.profile.xp % 100;
  document.querySelector('#nextXp').textContent = 100;
  document.querySelector('#levelProgress').style.width = `${data.profile.xp % 100}%`;
}

function gameArt(type) {
  if (type === 'sudoku') return '<div class="mini-sudoku" aria-hidden="true"><i>4</i><i></i><i>8</i><i></i><i>2</i><i></i><i>7</i><i></i><i>1</i></div>';
  if (type === 'cards') return '<div class="mini-cards" aria-hidden="true"><i>7</i><i>Q</i><i>♥</i></div>';
  if (type === 'tiles') return '<div class="mini-tiles" aria-hidden="true"><i>●</i><i>◆</i><i>♣</i><i>●</i><i>♣</i><i>◆</i><i>✳</i><i>✳</i></div>';
  if (type === 'letters') return `<div class="mini-letters" aria-hidden="true">${'PLAYFINDWORD'.slice(0, 15).padEnd(15, 'A').split('').map(letter => `<i>${letter}</i>`).join('')}</div>`;
  return '<div class="mini-cross" aria-hidden="true"><i>A</i><i>P</i><i>P</i><i>L</i><i>E</i><i></i><i>R</i><i></i><i></i></div>';
}

function renderCatalog() {
  const visible = gameCatalog.filter(game => activeFilter === 'all' || game.kind === activeFilter);
  document.querySelector('#shelfCount').textContent = `${visible.length} ${visible.length === 1 ? 'game' : 'games'}`;
  document.querySelector('#gameGrid').innerHTML = visible.map(game => `
    <article class="game-card ${game.coming ? 'is-coming' : ''}">
      ${game.coming ? '<span class="coming-label">Coming soon</span>' : ''}
      <button class="game-card-button" ${game.coming ? 'disabled aria-disabled="true"' : `data-launch="${game.id}"`} aria-label="${game.coming ? `${game.title}, coming soon` : `Play ${game.title}`}" >
        <span class="game-art">${gameArt(game.art)}</span>
        <span class="game-info"><span><strong>${game.title}</strong><small>${game.subtitle}</small></span><span class="play-arrow" aria-hidden="true">↗</span></span>
      </button>
    </article>`).join('');
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2500);
}

function saveGameState() {
  if (!activeGame) return;
  data.games[activeGame.id] = activeGame.state;
  data.recent = activeGame.id;
  persist();
}

function grantReward(id) {
  if (activeGame?.id !== id || activeGame.state.rewarded) return;
  const previousLevel = currentLevel();
  activeGame.state.finished = true;
  activeGame.state.rewarded = true;
  data.profile.xp += 50;
  data.profile.points += 25;
  data.profile.gamesPlayed += 1;
  if (!data.profile.completed.includes(id)) data.profile.completed.push(id);
  saveGameState();
  const unlockedPack = cardPacks.find(pack => pack.level > previousLevel && pack.level <= currentLevel());
  showToast(currentLevel() > previousLevel
    ? `Level ${currentLevel()}! ${playerTitle()} unlocked${unlockedPack ? ` · ${unlockedPack.name} card back unlocked` : ''}`
    : 'Puzzle complete! +25 points · +50 XP');
}

function gameHelpers() {
  return { toast: showToast, complete: grantReward };
}

function newGameState(id) {
  return gameModules[id].createState();
}

function restoreGameState(id, state) {
  if (!state || state.finished) return null;
  if (id === 'sudoku') return state.givens?.length === 81 ? state : null;
  if (id === 'solitaire') return state.tableau?.length === 7 ? { ...state, selected: null, drag: null, suppressClick: false } : null;
  if (id === 'mahjong') return state.tiles?.[0]?.face ? state : null;
  if (id === 'wordsearch') return Array.isArray(state.placements?.[0]) && typeof state.placements[0][0] === 'number' ? state : null;
  if (id === 'crossword') return state.rows?.length === 5 ? state : null;
  return null;
}

function renderActiveGame() {
  if (!activeGame) return;
  const game = gameModules[activeGame.id];
  const view = game.render(activeGame.state, { cardBack: cardPacks[data.profile.cardBack]?.id || cardPacks[0].id });
  document.querySelector('#gameBoard').innerHTML = view.board;
  document.querySelector('#gameAside').innerHTML = view.aside;
  saveGameState();
}

function openGame(id, fresh = false) {
  if (!gameModules[id]) return;
  const info = gameModules[id].metadata;
  const savedState = fresh ? null : restoreGameState(id, data.games[id]);
  activeGame = { id, info, state: savedState || newGameState(id) };
  document.querySelector('#homeView').hidden = true;
  document.querySelector('#playView').hidden = false;
  document.querySelector('#gameTitle').textContent = info.title;
  document.querySelector('#gameCategory').textContent = info.kind === 'cards' ? 'CARD GAME' : 'PUZZLE';
  document.querySelector('#gameDescription').textContent = info.description;
  renderActiveGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restoreGameFocus(id, handler, result) {
  let focus = result?.focus;
  if (focus === undefined && id === 'sudoku' && handler === 'handleClick') focus = activeGame.state.selected;
  if (typeof focus === 'number') document.querySelector(`[data-cell="${focus}"]`)?.focus();
  if (focus && typeof focus === 'object') document.querySelector(`[data-cross-row="${focus.row}"][data-cross-col="${focus.column}"]`)?.focus();
}

function dispatchGameEvent(handler, event) {
  if (!activeGame) return;
  const { id, state } = activeGame;
  const game = gameModules[id];
  if (typeof game[handler] !== 'function') return;
  const result = handler === 'handleClick' || handler === 'handleInput'
    ? game[handler](event.target, state, gameHelpers())
    : game[handler](event, state, gameHelpers());
  if (result?.solved || game.checkSolved?.(state) || (state.finished && !state.rewarded)) grantReward(id);
  if (result !== true && !result?.changed) return;
  renderActiveGame();
  restoreGameFocus(id, handler, result);
}

function showDialog(eyebrow, title, html) {
  document.querySelector('#dialogEyebrow').textContent = eyebrow;
  document.querySelector('#dialogTitle').textContent = title;
  document.querySelector('#dialogContent').innerHTML = html;
  document.querySelector('#infoDialog').showModal();
}

document.addEventListener('click', event => {
  const launch = event.target.closest('[data-launch]');
  if (launch) { openGame(launch.dataset.launch); return; }
  const filter = event.target.closest('[data-filter]');
  if (filter) {
    activeFilter = filter.dataset.filter;
    document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('is-selected', button === filter));
    renderCatalog();
    return;
  }
  const packChoice = event.target.closest('[data-pack]');
  if (packChoice) {
    const index = Number(packChoice.dataset.pack);
    if (cardPacks[index] && currentLevel() >= cardPacks[index].level) {
      data.profile.cardBack = index;
      persist();
      document.querySelector('#infoDialog').close();
      if (activeGame?.id === 'solitaire') renderActiveGame();
      showToast(`${cardPacks[index].name} card back equipped.`);
    }
    return;
  }
  dispatchGameEvent('handleClick', event);
});

document.addEventListener('input', event => dispatchGameEvent('handleInput', event));
document.addEventListener('keydown', event => dispatchGameEvent('handleKeyDown', event));

const gameBoard = document.querySelector('#gameBoard');
gameBoard.addEventListener('pointerdown', event => dispatchGameEvent('handlePointerDown', event));
window.addEventListener('pointermove', event => dispatchGameEvent('handlePointerMove', event));
window.addEventListener('pointerup', event => dispatchGameEvent('handlePointerUp', event));
window.addEventListener('pointercancel', event => dispatchGameEvent('handlePointerCancel', event));

document.querySelector('#backButton').addEventListener('click', () => {
  activeGame = null;
  document.querySelector('#playView').hidden = true;
  document.querySelector('#homeView').hidden = false;
  renderCatalog();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.querySelector('#newGameButton').addEventListener('click', () => {
  const id = activeGame?.id;
  if (id && confirm('Start a fresh game? Your current board will be replaced.')) openGame(id, true);
});

document.querySelector('#profileButton').addEventListener('click', () => {
  const nextTitle = titles.find(title => title.level > currentLevel())?.name || 'All titles unlocked';
  showDialog('YOUR PLAYFIELD PROFILE', 'A collection of little wins', `<div class="dialog-stats"><div class="dialog-stat"><strong>Level ${currentLevel()}</strong><small>${playerTitle()}</small></div><div class="dialog-stat"><strong>${data.profile.points}</strong><small>points collected</small></div><div class="dialog-stat"><strong>${data.profile.xp % 100}/100</strong><small>XP to next level</small></div><div class="dialog-stat"><strong>${data.profile.gamesPlayed}</strong><small>games completed</small></div></div><p>Titles unlock as you level up. Next title: ${nextTitle}.</p>`);
});

document.querySelector('#collectionButton').addEventListener('click', () => {
  const games = playableGames.map(id => {
    const game = gameModules[id].metadata;
    return `<div class="collection-item"><span>${game.title}</span><small>${data.profile.completed.includes(id) ? 'Completed' : 'Ready to play'}</small></div>`;
  }).join('');
  const packs = cardPacks.map((pack, index) => {
    const unlocked = currentLevel() >= pack.level;
    const equipped = data.profile.cardBack === index;
    return `<div class="collection-item"><span>${pack.name}<small>${unlocked ? 'Card back' : `Unlock at Level ${pack.level}`}</small></span><button class="pack-select" data-pack="${index}" ${unlocked ? '' : 'disabled'}>${equipped ? 'Equipped' : unlocked ? 'Equip' : 'Locked'}</button></div>`;
  }).join('');
  showDialog('YOUR GAME SHELF', 'Your collection', `<h3 class="collection-heading">Game progress</h3><div class="collection-list">${games}</div><h3 class="collection-heading">Card backs</h3><div class="collection-list">${packs}</div>`);
});

document.querySelector('#aboutButton').addEventListener('click', event => {
  event.preventDefault();
  showDialog('PLAYFIELD', 'Play your way', '<p>Drag cards with a mouse or finger, or tap a card and destination. Type directly into Sudoku and crossword squares. A gamepad can navigate focused controls with its D-pad and A button.</p><p>Your progress and active boards are saved in this browser on this device. Use Back up progress to download a copy; restore that file if you change browsers or devices. Clearing browser data can remove local saves.</p><p>To install on iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen. Other supported browsers show an Install button.</p>');
});

document.querySelector('#backupButton').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ ...data, version: 2 }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `playfield-progress-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  URL.revokeObjectURL(url);
  showToast('Progress backup downloaded.');
});

document.querySelector('#importInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (![1, 2].includes(imported.version) || !imported.profile || !Array.isArray(imported.profile.completed)) throw new Error('Invalid backup');
    data = { ...structuredClone(defaultData), ...imported, profile: { ...defaultData.profile, ...imported.profile }, games: {} };
    if (imported.version === 2) {
      for (const [id, state] of Object.entries(imported.games || {})) {
        const compatible = restoreGameState(id, state);
        if (compatible) data.games[id] = compatible;
      }
    }
    persist();
    renderCatalog();
    if (activeGame && data.games[activeGame.id]) { activeGame.state = data.games[activeGame.id]; renderActiveGame(); }
    showToast('Progress restored from backup.');
  } catch {
    showToast('That file is not a valid Playfield backup.');
  }
  event.target.value = '';
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event;
  document.querySelector('#installButton').hidden = false;
});
document.querySelector('#installButton').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  document.querySelector('#installButton').hidden = true;
});
window.addEventListener('appinstalled', () => showToast('Playfield is ready on your home screen.'));

let previousPadButtons = [];
function pollGamepad() {
  const pad = navigator.getGamepads?.().find(Boolean);
  if (pad) {
    const buttons = pad.buttons;
    const activate = buttons[0]?.pressed || buttons[1]?.pressed;
    const wasActivated = previousPadButtons[0] || previousPadButtons[1];
    if (activate && !wasActivated) {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.matches('button, input, a')) focused.click();
      else document.querySelector('#gameGrid button:not(:disabled), [data-number], [data-cell]')?.focus();
    }
    const direction = buttons[12]?.pressed ? -1 : buttons[13]?.pressed ? 1 : 0;
    if (direction && !previousPadButtons[12] && !previousPadButtons[13]) {
      const controls = [...document.querySelectorAll('#gameGrid button:not(:disabled), #gameBoard button:not(:disabled), #gameBoard input:not([readonly]), .filter-button')];
      if (controls.length) {
        const current = controls.indexOf(document.activeElement);
        controls[(current + direction + controls.length) % controls.length]?.focus();
      }
    }
    previousPadButtons = buttons.map(button => button.pressed);
  } else previousPadButtons = [];
  requestAnimationFrame(pollGamepad);
}

document.querySelector('#dateLabel').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
renderCatalog();
updateProfile();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
requestAnimationFrame(pollGamepad);