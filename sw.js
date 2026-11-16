const CACHE_NAME = 'playfield-shell-v7';
const APP_FILES = [
  './', './index.html', './styles.css', './app.js', './wallet.js', './store.js', './rng.js',
  './history.js', './stats.js', './economy.js', './daily.js', './feedback.js', './achievements.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './fonts/fonts.css',
  './fonts/dm-sans-400-latin.woff2', './fonts/dm-sans-400-latin-ext.woff2',
  './fonts/dm-mono-400-latin.woff2', './fonts/dm-mono-400-latin-ext.woff2',
  './fonts/dm-mono-500-latin.woff2', './fonts/dm-mono-500-latin-ext.woff2',
  './fonts/playfair-display-500-latin.woff2', './fonts/playfair-display-500-latin-ext.woff2',
  './fonts/playfair-display-500-italic-latin.woff2', './fonts/playfair-display-500-italic-latin-ext.woff2',
  './games/hints.js',
  './games/index.js', './games/solitaire.js', './games/sudoku.js', './games/sudoku-generator.js',
  './games/mahjong.js', './games/wordsearch.js', './games/crossword.js', './games/crossword-data.js',
  './games/g2048.js', './games/memory.js', './games/tictactoe.js', './games/minesweeper.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match('./index.html'))));
});