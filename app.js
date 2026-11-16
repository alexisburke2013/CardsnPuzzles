import { gameModules, comingSoonGames } from './games/index.js';
import { awardCredits, normalizeWalletProfile, spendCredits as debitCredits } from './wallet.js';
import { load as loadSave, save as writeSave } from './store.js';
import { earnCredits, DAILY_CREDIT_CAP } from './economy.js';
import { createHistory, commit as commitHistory, reset as resetHistory, undo as undoHistory, redo as redoHistory, canUndo, canRedo } from './history.js';
import { normalizeStats, recordResult, winRate } from './stats.js';
import { dailySeed, normalizeDaily, isCompletedToday, completeDaily, currentStreak } from './daily.js';
import { feedback, setMuted, isMuted } from './feedback.js';

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
const defaultData = {
  profile: { xp: 0, credits: 15, completed: [], gamesPlayed: 0, cardBack: 0, theme: 'light', muted: false },
  recent: 'sudoku',
  games: {},
  stats: {},
  daily: { lastDate: null, streak: 0, bestStreak: 0, completedDate: null }
};

/* Per-game save schema. `validate` rejects boards whose shape no longer fits,
   so a game can change its state without breaking older saves. `restore` runs
   after validation to strip transient fields (drag objects, selections) that
   must never be persisted. Bump a game's `version` when its shape changes and
   add a migration where the old data can be repaired instead of dropped. */
const gameSchema = {
  sudoku: { version: 2, validate: state => state.givens?.length === 81 && Array.isArray(state.notes), restore: state => ({ ...state, selected: state.selected ?? null }) },
  solitaire: { version: 2, validate: state => state.tableau?.length === 7, restore: state => ({ ...state, selected: null, drag: null, lastTap: null, suppressClick: false }) },
  mahjong: { version: 1, validate: state => state.tiles?.[0]?.face },
  wordsearch: { version: 1, validate: state => gameModules.wordsearch.isValidState(state), restore: state => ({ ...state, drag: null, preview: [] }) },
  crossword: { version: 2, validate: state => Array.isArray(state.letters) && Array.isArray(state.entries), restore: state => ({ ...state, selected: null }) },
  g2048: { version: 1, validate: state => Array.isArray(state.cells) && state.cells.length === 16, restore: state => ({ ...state, swipe: null }) },
  memory: { version: 1, validate: state => Array.isArray(state.deck) && state.deck.length % 2 === 0, restore: state => ({ ...state, flipped: [], lock: false, hint: null }) }
};

let data = loadData();
let activeGame = null;
let activeFilter = 'all';
let toastTimer;
let installPrompt = null;
let history = createHistory();
let timerHandle = null;
let undoBusy = false;

function restoreGameState(id, state) {
  const schema = gameSchema[id];
  if (!state || state.finished || !schema?.validate(state)) return null;
  return schema.restore ? schema.restore(state) : state;
}

function loadData() {
  const saved = loadSave({ supportedVersions: [1, 2] });
  if (!saved?.profile) return structuredClone(defaultData);
  const games = {};
  if (saved.version === 2) {
    for (const [id, state] of Object.entries(saved.games || {})) {
      const compatible = restoreGameState(id, state);
      if (compatible) games[id] = compatible;
    }
  }
  return {
    ...structuredClone(defaultData),
    ...saved,
    profile: normalizeProfile(saved.profile),
    stats: normalizeStats(saved.stats),
    daily: normalizeDaily(saved.daily),
    games
  };
}

function normalizeProfile(profile = {}) {
  return { ...defaultData.profile, ...normalizeWalletProfile(profile, defaultData.profile.credits) };
}

/* Writes are debounced: a render (or a drag) can call persist many times a
   second, and localStorage writes are synchronous. A short delay coalesces them
   while pagehide/visibility flush guarantees nothing is lost on exit. */
let saveTimer = null;

function persist() {
  updateProfile();
  if (saveTimer) return;
  saveTimer = setTimeout(flushSave, 400);
}

function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    writeSave(data);
  } catch {
    showToast('This browser could not save progress. Check available storage.');
  }
}

window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

function currentLevel() { return Math.floor(data.profile.xp / 100) + 1; }
function playerTitle() { return [...titles].reverse().find(title => currentLevel() >= title.level).name; }

function updateProfile() {
  const level = currentLevel();
  document.querySelector('#playerLevel').textContent = `Level ${level}`;
  document.querySelector('#playerTitle').textContent = playerTitle();
  document.querySelector('#coinCount').textContent = data.profile.credits;
  document.querySelector('#gameCredits').textContent = data.profile.credits;
  document.querySelector('#xpCount').textContent = data.profile.xp % 100;
  document.querySelector('#nextXp').textContent = 100;
  document.querySelector('#levelProgress').style.width = `${data.profile.xp % 100}%`;
  document.querySelector('#streakCount').textContent = currentStreak(data.daily);
}

/* --- Theme + sound preferences -------------------------------------------- */

function applyTheme() {
  const dark = data.profile.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#1b201d' : '#f3f1e8');
  const button = document.querySelector('#themeButton');
  button.setAttribute('aria-pressed', String(dark));
  document.querySelector('#themeLabel').textContent = dark ? 'Light mode' : 'Dark mode';
}

function applySound() {
  const muted = Boolean(data.profile.muted);
  setMuted(muted);
  const button = document.querySelector('#soundButton');
  button.setAttribute('aria-pressed', String(!muted));
  document.querySelector('#soundLabel').textContent = muted ? 'Sound off' : 'Sound on';
}

function toggleTheme() {
  data.profile.theme = data.profile.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  persist();
  showToast(data.profile.theme === 'dark' ? 'Dark mode on.' : 'Light mode on.');
}

function toggleSound() {
  data.profile.muted = !data.profile.muted;
  applySound();
  persist();
  if (!data.profile.muted) feedback('select');
  showToast(data.profile.muted ? 'Sound and haptics off.' : 'Sound and haptics on.');
}

document.querySelector('#themeButton').addEventListener('click', toggleTheme);
document.querySelector('#soundButton').addEventListener('click', toggleSound);

function updateDailyCard() {
  const done = isCompletedToday(data.daily);
  const streak = currentStreak(data.daily);
  document.querySelector('#dailyStatus').textContent = done
    ? `Today's board is done${streak > 1 ? ` — ${streak}-day streak` : ''}. Come back tomorrow for a fresh one.`
    : 'Solve the daily Sudoku to keep your streak alive. Everyone gets the same board.';
  document.querySelector('#dailyButton').textContent = done ? 'Replay daily Sudoku' : 'Play daily Sudoku';
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
  document.querySelector('#featureIndex').textContent = `01 / ${String(gameCatalog.length).padStart(2, '0')}`;
  document.querySelector('#gameGrid').innerHTML = visible.map((game, index) => `
    <article class="game-card ${game.coming ? 'is-coming' : ''}" style="--card-index:${index}">
      ${game.coming ? '<span class="coming-label">Coming soon</span>' : ''}
      ${!game.coming && game.id === data.recent ? '<span class="recent-label">Last played</span>' : ''}
      <button class="game-card-button" ${game.coming ? 'disabled aria-disabled="true"' : `data-launch="${game.id}"`} aria-label="${game.coming ? `${game.title}, coming soon` : `Play ${game.title}`}" >
        <span class="game-art">${gameArt(game.art)}</span>
        <span class="game-info"><span><strong>${game.title}</strong><small>${game.subtitle}</small></span><span class="play-arrow" aria-hidden="true">↗</span></span>
      </button>
    </article>`).join('');
}

function syncNav() {
  const hash = window.location.hash || '#home';
  document.querySelectorAll('.nav-link[data-nav]').forEach(link => {
    link.classList.toggle('is-active', link.getAttribute('href') === hash);
  });
  // Anchors can't reveal the home view while a game is open, so nav
  // links double as a way back to the shelf.
  if (activeGame && (hash === '#home' || hash === '#games')) {
    activeGame = null;
    document.querySelector('#playView').hidden = true;
    document.querySelector('#homeView').hidden = false;
    renderCatalog();
  }
}
window.addEventListener('hashchange', syncNav);

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
  const elapsed = activeGame.startedAt ? Math.round((Date.now() - activeGame.startedAt) / 1000) : null;
  const moves = Number.isFinite(activeGame.state.moves) ? activeGame.state.moves : null;
  const hints = Number(activeGame.state.hintsUsed) || 0;
  data.profile.xp += 50;
  const granted = earnCredits(data.profile, 25);
  data.profile.gamesPlayed += 1;
  if (!data.profile.completed.includes(id)) data.profile.completed.push(id);
  recordResult(data.stats, id, { outcome: 'won', time: elapsed, moves, hints });
  const daily = activeGame.daily ? completeDaily(data.daily) : null;
  saveGameState();
  flushSave();
  stopTimer();
  const unlockedPack = cardPacks.find(pack => pack.level > previousLevel && pack.level <= currentLevel());
  if (currentLevel() > previousLevel) {
    showToast(`Level ${currentLevel()}! ${playerTitle()} unlocked${unlockedPack ? ` · ${unlockedPack.name} card back unlocked` : ''}`);
  } else if (granted < 25) {
    showToast(`Puzzle complete! +50 XP · daily credit cap reached (${DAILY_CREDIT_CAP}/day)`);
  } else {
    showToast('Puzzle complete! +25 credits · +50 XP');
  }
  if (daily) { showToast(`Daily complete — ${daily}-day streak!`); }
}

function gameHelpers() {
  return {
    toast: showToast,
    rerender() { renderActiveGame(); },
    complete: grantReward,
    spendCredits(amount) {
      if (!debitCredits(data.profile, amount)) {
        showToast(`You need ${amount} credits for that hint.`);
        feedback('error');
        return false;
      }
      if (activeGame) activeGame.state.hintsUsed = (Number(activeGame.state.hintsUsed) || 0) + 1;
      persist();
      feedback('hint');
      showToast(`${amount} credits spent.`);
      return true;
    }
  };
}

/* --- Undo history --------------------------------------------------------- */

function snapshot() {
  return activeGame ? structuredClone(activeGame.state) : null;
}

function updateToolButtons() {
  document.querySelector('#undoButton').disabled = !canUndo(history);
  document.querySelector('#redoButton').disabled = !canRedo(history);
}

function resetGameHistory() {
  history = createHistory();
  resetHistory(history, snapshot());
  updateToolButtons();
}

function applyHistoryState(state) {
  if (!state) return;
  undoBusy = true;
  activeGame.state = structuredClone(state);
  renderActiveGame();
  undoBusy = false;
}

function doUndo() {
  if (!canUndo(history)) return;
  applyHistoryState(undoHistory(history));
  updateToolButtons();
}

function doRedo() {
  if (!canRedo(history)) return;
  applyHistoryState(redoHistory(history));
  updateToolButtons();
}

/* --- Timer ---------------------------------------------------------------- */

function formatClock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function tickTimer() {
  if (!activeGame?.startedAt) return;
  const seconds = Math.round((Date.now() - activeGame.startedAt) / 1000);
  document.querySelector('#gameTimer strong').textContent = formatClock(seconds);
}

function startTimer() {
  stopTimer();
  timerHandle = setInterval(tickTimer, 1000);
  tickTimer();
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
}

function newGameState(id, options = {}) {
  return gameModules[id].createState(options);
}

function renderActiveGame() {
  if (!activeGame) return;
  const game = gameModules[activeGame.id];
  const view = game.render(activeGame.state, { cardBack: cardPacks[data.profile.cardBack]?.id || cardPacks[0].id, credits: data.profile.credits });
  document.querySelector('#gameBoard').innerHTML = view.board;
  document.querySelector('#gameAside').innerHTML = view.aside;
  saveGameState();
}

function openGame(id, fresh = false, options = {}) {
  if (!gameModules[id]) return;
  const info = gameModules[id].metadata;
  const savedState = fresh ? null : restoreGameState(id, data.games[id]);
  activeGame = {
    id,
    info,
    state: savedState || newGameState(id, options),
    daily: Boolean(options.daily),
    startedAt: Date.now(),
    elapsed: savedState?.elapsed ?? 0
  };
  document.querySelector('#homeView').hidden = true;
  document.querySelector('#playView').hidden = false;
  document.querySelector('#gameTitle').textContent = info.title;
  document.querySelector('#gameCategory').textContent = info.kind === 'cards' ? 'CARD GAME' : 'PUZZLE';
  document.querySelector('#gameDescription').textContent = info.description;
  document.querySelector('#newGameButton').hidden = false;
  renderActiveGame();
  resetGameHistory();
  startTimer();
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
  const snapshotHandlers = ['handleClick', 'handleInput', 'handleKeyDown', 'handlePointerUp'];
  const before = snapshotHandlers.includes(handler) ? snapshot() : null;
  const result = handler === 'handleClick' || handler === 'handleInput'
    ? game[handler](event.target, state, gameHelpers())
    : game[handler](event, state, gameHelpers());
  if (result?.solved || game.checkSolved?.(state) || (state.finished && !state.rewarded)) grantReward(id);
  if (result !== true && !result?.changed) return;
  // Games that manipulate the DOM directly during a drag (Solitaire) return
  // nothing from pointermove and are skipped here; those that need a repaint
  // (Word Search preview) return `changed`.
  renderActiveGame();
  // Only record a step when the game says the change is meaningful and we are
  // not already replaying history.
  if (before && result?.undoable && !undoBusy) {
    commitHistory(history, snapshot());
    updateToolButtons();
    feedback(result?.solved ? 'win' : 'move');
  }
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
document.addEventListener('keydown', event => {
  const meta = event.ctrlKey || event.metaKey;
  if (meta && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.shiftKey ? doRedo() : doUndo();
    return;
  }
  if (meta && event.key.toLowerCase() === 'y') { event.preventDefault(); doRedo(); return; }
  dispatchGameEvent('handleKeyDown', event);
});
document.addEventListener('change', event => {
  const wordSelect = event.target.closest('[data-word-difficulty]');
  if (wordSelect && activeGame?.id === 'wordsearch') {
    const state = activeGame.state;
    const hasProgress = state.found.length || state.hintedWord !== null || state.first !== null;
    if (hasProgress && !confirm('Changing difficulty starts a new word search. Continue?')) {
      renderActiveGame();
      return;
    }
    activeGame.state = newGameState('wordsearch', { difficulty: wordSelect.value });
    renderActiveGame();
    resetGameHistory();
    showToast(`${wordSelect.value[0].toUpperCase()}${wordSelect.value.slice(1)} word search ready.`);
    return;
  }
  const sudokuSelect = event.target.closest('[data-sudoku-difficulty]');
  if (sudokuSelect && activeGame?.id === 'sudoku') {
    if (!confirm('Changing difficulty starts a new Sudoku. Continue?')) { renderActiveGame(); return; }
    activeGame.state = newGameState('sudoku', { difficulty: sudokuSelect.value });
    renderActiveGame();
    resetGameHistory();
    showToast(`${sudokuSelect.value[0].toUpperCase()}${sudokuSelect.value.slice(1)} Sudoku ready.`);
    return;
  }
  const drawSelect = event.target.closest('[data-solitaire-draw]');
  if (drawSelect && activeGame?.id === 'solitaire') {
    activeGame.state.draw = Number(drawSelect.value);
    renderActiveGame();
    resetGameHistory();
    showToast(`Drawing ${drawSelect.value === '3' ? 'three' : 'one'} card at a time.`);
    return;
  }
  const memorySelect = event.target.closest('[data-memory-difficulty]');
  if (memorySelect && activeGame?.id === 'memory') {
    const hasProgress = activeGame.state.matched > 0 || activeGame.state.flipped.length;
    if (hasProgress && !confirm('Changing difficulty starts a new Memory game. Continue?')) { renderActiveGame(); return; }
    activeGame.state = newGameState('memory', { difficulty: memorySelect.value });
    renderActiveGame();
    resetGameHistory();
    showToast(`${memorySelect.value[0].toUpperCase()}${memorySelect.value.slice(1)} Memory ready.`);
  }
});

const gameBoard = document.querySelector('#gameBoard');
gameBoard.addEventListener('pointerdown', event => dispatchGameEvent('handlePointerDown', event));
window.addEventListener('pointermove', event => dispatchGameEvent('handlePointerMove', event));
window.addEventListener('pointerup', event => dispatchGameEvent('handlePointerUp', event));
window.addEventListener('pointercancel', event => dispatchGameEvent('handlePointerCancel', event));

function closeGame() {
  stopTimer();
  activeGame = null;
  document.querySelector('#playView').hidden = true;
  document.querySelector('#homeView').hidden = false;
  renderCatalog();
  updateDailyCard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelector('#backButton').addEventListener('click', closeGame);
document.querySelector('#undoButton').addEventListener('click', doUndo);
document.querySelector('#redoButton').addEventListener('click', doRedo);
document.querySelector('#newGameButton').addEventListener('click', () => {
  const id = activeGame?.id;
  const options = id === 'wordsearch' ? { difficulty: activeGame.state.difficulty }
    : id === 'sudoku' ? { difficulty: activeGame.state.difficulty }
    : id === 'memory' ? { difficulty: activeGame.state.difficulty }
    : {};
  if (id && confirm('Start a fresh game? Your current board will be replaced.')) openGame(id, true, options);
});
document.querySelector('#dailyButton').addEventListener('click', () => {
  openGame('sudoku', true, { difficulty: 'medium', seed: dailySeed('sudoku'), daily: true });
  showToast('Daily Sudoku ready. Everyone has this board today.');
});

function showAbout() {
  showDialog('PLAYFIELD', 'Play your way', '<p>Drag cards with a mouse or finger, or tap a card and destination. Type directly into Sudoku and crossword squares. A gamepad can navigate focused controls with its D-pad and A button.</p><p>Your progress and active boards are saved in this browser on this device. Use Back up progress to download a copy; restore that file if you change browsers or devices. Clearing browser data can remove local saves.</p><p>To install on iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen. Other supported browsers show an Install button.</p>');
}

function backupProgress() {
  const blob = new Blob([JSON.stringify({ ...data, version: 2 }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `playfield-progress-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  URL.revokeObjectURL(url);
  showToast('Progress backup downloaded.');
}

document.querySelector('#profileButton').addEventListener('click', () => {
  const nextTitle = titles.find(title => title.level > currentLevel())?.name || 'All titles unlocked';
  const statsRows = playableGames.map(id => {
    const entry = data.stats[id];
    if (!entry?.played) return `<div class="collection-item"><span>${gameModules[id].metadata.title}</span><small>Not played yet</small></div>`;
    const best = entry.bestTime !== null ? ` · best ${formatClock(entry.bestTime)}` : '';
    return `<div class="collection-item"><span>${gameModules[id].metadata.title}<small>${entry.won} won of ${entry.played}${best}${entry.streak ? ` · ${entry.streak} streak` : ''}</small></span><small>${winRate(entry)}%</small></div>`;
  }).join('');
  showDialog('YOUR PLAYFIELD PROFILE', 'A collection of little wins', `<div class="dialog-stats"><div class="dialog-stat"><strong>Level ${currentLevel()}</strong><small>${playerTitle()}</small></div><div class="dialog-stat"><strong>${data.profile.credits}</strong><small>credits available</small></div><div class="dialog-stat"><strong>${data.profile.xp % 100}/100</strong><small>XP to next level</small></div><div class="dialog-stat"><strong>${currentStreak(data.daily)}</strong><small>day streak</small></div></div><h3 class="collection-heading">Statistics</h3><div class="collection-list">${statsRows}</div><p>Titles unlock as you level up. Next title: ${nextTitle}.</p><div class="dialog-actions"><button class="quiet-button" data-dialog-action="theme">${data.profile.theme === 'dark' ? 'Light mode' : 'Dark mode'}</button><button class="quiet-button" data-dialog-action="sound">${data.profile.muted ? 'Sound off' : 'Sound on'}</button><button class="quiet-button" data-dialog-action="collection">My collection</button><button class="quiet-button" data-dialog-action="backup">Back up progress</button><label class="quiet-button" for="importInput">Restore backup</label><button class="quiet-button" data-dialog-action="about">About &amp; controls</button></div>`);
});

function showCollection() {
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
}

document.querySelector('#collectionButton').addEventListener('click', showCollection);

const dialogActions = { collection: showCollection, about: showAbout, backup: backupProgress, theme: toggleTheme, sound: toggleSound };
document.querySelector('#dialogContent').addEventListener('click', event => {
  const action = event.target.closest('[data-dialog-action]')?.dataset.dialogAction;
  if (dialogActions[action]) dialogActions[action]();
});

document.querySelector('#aboutButton').addEventListener('click', event => {
  event.preventDefault();
  showAbout();
});

document.querySelector('#backupButton').addEventListener('click', backupProgress);

document.querySelector('#importInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (![1, 2].includes(imported.version) || !imported.profile || !Array.isArray(imported.profile.completed)) throw new Error('Invalid backup');
    data = { ...structuredClone(defaultData), ...imported, profile: normalizeProfile(imported.profile), stats: normalizeStats(imported.stats), daily: normalizeDaily(imported.daily), games: {} };
    if (imported.version === 2) {
      for (const [id, state] of Object.entries(imported.games || {})) {
        const compatible = restoreGameState(id, state);
        if (compatible) data.games[id] = compatible;
      }
    }
    persist();
    flushSave();
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
let padFrame = null;
const DEADZONE = 0.35;
const PAD_FOCUSABLE = 'button:not(:disabled), input:not([readonly]), a[href], select';

/* Pick the focusable element nearest to `current` in the pressed direction,
   scoring by travel in the wanted axis minus travel off it. This gives real 2D
   movement (down goes to the next row) instead of flat list order. */
function moveFocus(dx, dy) {
  const controls = [...document.querySelectorAll('#gameBoard, #gameGrid, .filter-row, .side-nav, .play-tools, .daily-card')]
    .flatMap(region => [...region.querySelectorAll(PAD_FOCUSABLE)])
    .filter(element => element.offsetParent !== null || element === document.activeElement);
  if (!controls.length) return;
  const current = document.activeElement instanceof HTMLElement && controls.includes(document.activeElement)
    ? document.activeElement
    : null;
  if (!current) { controls[0].focus(); return; }
  const from = current.getBoundingClientRect();
  const originX = from.left + from.width / 2;
  const originY = from.top + from.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const element of controls) {
    if (element === current) continue;
    const box = element.getBoundingClientRect();
    const axis = (box.left + box.width / 2) - originX;
    const cross = (box.top + box.height / 2) - originY;
    const along = dx ? axis * dx : cross * dy;
    const off = dx ? Math.abs(cross) : Math.abs(axis);
    if (along <= 8) continue;
    const score = along + off * 1.6;
    if (score < bestScore) { bestScore = score; best = element; }
  }
  best?.focus();
}

function padDirection(pad) {
  const [axisX = 0, axisY = 0] = pad.axes ?? [];
  if (Math.abs(axisX) > DEADZONE || Math.abs(axisY) > DEADZONE) {
    if (Math.abs(axisX) > Math.abs(axisY)) return { dx: Math.sign(axisX), dy: 0, key: axisX > 0 ? 'right' : 'left' };
    return { dx: 0, dy: Math.sign(axisY), key: axisY > 0 ? 'down' : 'up' };
  }
  const buttons = pad.buttons;
  if (buttons[12]?.pressed) return { dx: 0, dy: -1, key: 'up' };
  if (buttons[13]?.pressed) return { dx: 0, dy: 1, key: 'down' };
  if (buttons[14]?.pressed) return { dx: -1, dy: 0, key: 'left' };
  if (buttons[15]?.pressed) return { dx: 1, dy: 0, key: 'right' };
  return null;
}

function pollGamepad() {
  const pad = navigator.getGamepads?.().find(Boolean);
  if (!pad) {
    previousPadButtons = [];
    padFrame = null; // Idle pause: stop the loop until a pad connects again.
    return;
  }
  const buttons = pad.buttons;
  const activate = buttons[0]?.pressed || buttons[1]?.pressed;
  const wasActivated = previousPadButtons[0] || previousPadButtons[1];
  if (activate && !wasActivated) {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.matches('button, input, a, select')) focused.click();
    else document.querySelector('#gameGrid button:not(:disabled), [data-number], [data-cell]')?.focus();
  }
  // B (button 1) cancels a pending Solitaire selection before it confirms.
  if (buttons[1]?.pressed && !previousPadButtons[1] && activeGame?.state?.selected) {
    activeGame.state.selected = null;
    renderActiveGame();
  }
  const direction = padDirection(pad);
  const directionKey = direction?.key;
  const previousKey = previousPadButtons._direction;
  if (direction && directionKey !== previousKey) moveFocus(direction.dx, direction.dy);
  previousPadButtons = buttons.map(button => button.pressed);
  previousPadButtons._direction = direction ? directionKey : null;
  padFrame = requestAnimationFrame(pollGamepad);
}

/* Start polling only when a controller is already present, and restart it when
   one connects. This avoids a forever-running rAF loop draining mobile battery. */
function ensureGamepadLoop() {
  if (padFrame || !navigator.getGamepads?.().some(Boolean)) return;
  padFrame = requestAnimationFrame(pollGamepad);
}
window.addEventListener('gamepadconnected', () => { showToast('Controller connected. D-pad or stick to navigate, A to select, B to cancel.'); ensureGamepadLoop(); });
window.addEventListener('gamepaddisconnected', () => { padFrame = null; });

document.querySelector('#dateLabel').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
applyTheme();
applySound();
renderCatalog();
updateProfile();
updateDailyCard();
syncNav();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
ensureGamepadLoop();