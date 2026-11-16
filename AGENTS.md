# Playfield Agent Memory

This file is the project orientation for coding agents. Read the relevant chapter before changing a game, input flow, or save format. Headings are intentionally stable for quick search and indexing.

## 00. Project Snapshot

Playfield is a browser-first PWA hub for short card and puzzle games. It is a static ES-module app with no bundler or runtime dependencies. The app should feel warm, tactile, playful, and usable on phone, tablet, desktop, keyboard, mouse, touch, and gamepad.

## 01. Source Map

- `index.html`: shared hub and game-shell markup. The app script must remain `type="module"`.
- `app.js`: catalog, profile progression, local persistence, rewards, game lifecycle, PWA install, backup/restore, and cross-game input dispatch.
- `store.js`: the save read/write seam and schema versioning. Backed by `localStorage` today; a Supabase adapter can implement the same shape later.
- `rng.js`: seeded random generator (`createRng`, `todaySeed`) so daily or shared boards are reproducible.
- `wallet.js`: the shared earn/spend/legacy-migration rules for the player credit balance.
- `economy.js`: daily credit-earning cap (`earnCredits`, `DAILY_CREDIT_CAP`). XP is never capped.
- `history.js`: the shared undo/redo snapshot stack. The hub commits a clone before each meaningful move.
- `stats.js`: pure per-game result aggregation (played/won/lost/best time/streak) shown in the profile dialog.
- `daily.js`: the daily-challenge seed and streak rules (`dailySeed`, `completeDaily`, `currentStreak`).
- `feedback.js`: Web Audio sound cues and `navigator.vibrate` haptics behind a mute flag (`feedback`, `setMuted`).
- `fonts/`: self-hosted DM Sans, DM Mono, and Playfair Display WOFF2 subsets (`fonts.css` plus `LICENSE.txt`).
- `games/hints.js`: shared hint price and disabled-state button markup.
- `games/index.js`: registry for playable modules and metadata for coming-soon games.
- `games/solitaire.js`: deal, move validation, click/tap, double-tap, pointer drag/drop, auto-complete, and dead-end detection.
- `games/sudoku.js`: seeded puzzle state, editable-cell rendering, number entry, pencil notes, same-number highlight, mistakes, and keyboard navigation.
- `games/sudoku-generator.js`: seeded Sudoku generator/solver (`generatePuzzle`) with per-difficulty clue counts.
- `games/mahjong.js`: layered tile layout, blocked/open rules, matching, dead-end detection (`hasMoves`), and reshuffle (`shuffleRemaining`).
- `games/wordsearch.js`: difficulty configuration, word placement generation, state validation, endpoint selection, and pointer drag-to-select.
- `games/crossword.js`: grid rendering, across/down entry solving, clue navigation, and letter hints.
- `games/crossword-data.js`: the grid letters and clue list. Edit this file to change the crossword; crossing letters stay in sync because the grid is the source of truth.
- `games/g2048.js`: seeded tile-merge puzzle. `move()` is pure (slide/merge/spawn), input arrives via arrow keys, the on-screen pad, or a board swipe, and `bestMove()` powers the hint.
- `games/memory.js`: seeded card-flip matching with easy/medium/hard pair counts; a matched pair is one undoable move and mismatches flip back after a short delay.
- `styles.css`: shared design system, responsive layouts, game pieces, and motion. The phone
  breakpoint (`max-width:760px`) turns the sidebar into a bottom navigation bar and pins game
  actions above it; the `Touch ergonomics` section at the end of the file owns 44px hit targets,
  safe-area insets, and tap-highlight resets. Keep board cells out of that min-height list so a
  Sudoku grid still fits a phone.
- `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`:
  PWA identity. iOS ignores SVG for Add to Home Screen, so keep the PNGs in sync with the SVG.
- `sw.js`: versioned offline shell cache. Add every new module and asset to `APP_FILES` and bump
  `CACHE_NAME`.
- `docs/ROADMAP.md`: the product and engineering roadmap. It holds the verified-bug list and the
  full upgrade checklist (design, systems, architecture, input model, new games). Read it before
  starting feature work; it is the source of truth for what to build next.

## 02. Game Module Contract

Each game exports a default module with `metadata`, `createState()`, and `render(state, options)`. Rendering returns `{ board, aside }` HTML strings. Optional event handlers are `handleClick(target, state, helpers)`, `handleInput(target, state)`, `handleKeyDown(event, state)`, and pointer handlers.

Return values drive the hub:
- `false` / `null` — nothing happened; no rerender.
- `true` — rerender but do not record an undo step.
- `{ changed: true }` — rerender.
- `{ changed: true, undoable: true }` — rerender and push an undo snapshot. Use this for any move a player would want to take back.
- `{ changed: true, solved: true }` — completion; the hub awards the reward. Alternatively export `checkSolved(state)`.

`focus` (a cell index or `{ row, column }`) restores focus after a rerender. `helpers.toast(message)` gives feedback; `helpers.complete(gameId)` awards progression; `helpers.spendCredits(amount)` is the only game-facing wallet spend API.

Game state must be JSON-serializable. Do not save DOM nodes, PointerEvents, timers, or other transient browser objects. Transient fields (the Solitaire drag object, Word Search `drag`/`preview`, selections) are stripped in the `gameSchema.restore` hooks in `app.js` before saving.

## 03. Add or Customize a Game

1. Create `games/your-game.js` and add its default export to `games/index.js`.
2. Put its title, category, card art key, and shelf subtitle in `metadata`.
3. Keep rules and board state in that module; use the `CUSTOMIZE ... HERE` notes at the top of each game file as examples.
4. Add its module URL to `sw.js` and bump `CACHE_NAME` so installed/offline clients pick it up.
5. Add focused state/rule checks to `tests/games.test.js`.

For content tweaks, edit the constants at the top of the corresponding module or its data file: Sudoku difficulty/clue counts in `games/sudoku-generator.js`, Word Search `DIFFICULTIES`/`WORDS`/`DIRECTIONS`, Crossword grid and clues in `games/crossword-data.js`, Mahjong `TILE_PAIRS`, Solitaire `SUITS` and its move validators. Keep generated Word Search placements as complete cell-index paths; `isValidState()` rejects legacy coordinate-pair saves. For the crossword, keep `GRID` and `ENTRIES` consistent so every maximal run of two or more letters is a listed answer. Adjust the shared hint price in `games/hints.js`. Use `styles.css` for visuals; do not put game rules in CSS.

## 04. Input and Accessibility Rules

- Prefer native input elements for text/number entry; keep `inputmode`, labels, focus restoration, and keyboard navigation working.
- Mouse drag must have a tap/click alternative. Touch drag uses Pointer Events and must handle `pointercancel`. Word Search supports both drag and tap-first/tap-last; Solitaire supports drag and tap-to-move.
- The gamepad loop polls only while a controller is connected (it self-pauses when none is present) and uses spatial 2D navigation (`moveFocus`) rather than flat list order. A selects the focused control; B cancels a pending selection. Reconnect starts the loop again via `gamepadconnected`.
- Undo/redo is global: `Ctrl/Cmd+Z` and `Ctrl+Y` (or `Shift+Ctrl+Z`) map to the toolbar buttons. Games opt in per action with the `undoable` result flag.
- Keep touch targets stable in size. Avoid hover-only instructions or state.
- Respect `prefers-reduced-motion`. Use animation to communicate a move, match, error, or reward, not as decoration alone.
- Preserve visible focus for keyboard and controller users.

## 05. Save and Progression Rules

Local saves live in `localStorage` under `playfield-save-v2`; the legacy v1 profile is still read. `store.js` owns the keys and the schema version, `wallet.js` migrates legacy `points` to `credits`. When game state shapes change, bump the game's `version` and validate/repair it in the `gameSchema` table in `app.js`; preserve profile XP, credits, titles, stats, streak, and cosmetics even if an old in-progress board must restart. Keep backups importable and versioned.

New profiles start with 15 credits. The shared reward is currently 25 credits and 50 XP per completed game; each game hint costs 5 credits. Credits earned per calendar day are capped by `economy.js` (`DAILY_CREDIT_CAP`), but XP is uncapped so levels keep moving. `app.js` owns wallet spending, the daily cap, reward-once logic, stats recording, and daily-streak completion; game modules signal completion and request hint spending but must not mutate the wallet directly.

The daily challenge (`daily.js`) seeds Sudoku with the date, so every player gets the same board and `completeDaily` tracks the streak. Finishing a daily also awards the normal reward.

## 06. Open-Source Reference Comparison

These repositories were inspected for interaction and architecture patterns. No code or artwork was copied.

- [gcedo/react-solitaire](https://github.com/gcedo/react-solitaire) (MIT) separates state/update patterns and uses drag-and-drop, immutable data, and tests. Playfield uses Pointer Events plus click/tap fallback while staying framework-free.
- [robatron/sudoku.js](https://github.com/robatron/sudoku.js) (MIT) is a Sudoku generator/solver library. Playfield currently ships one verified seed; puzzle generation and uniqueness checking remain a future module improvement.
- [danbeck/green-mahjong](https://github.com/danbeck/green-mahjong) advertises three themes, six layouts, and mobile browser support. Its game is GPL-3.0 and its artwork is CC-BY-NC; do not copy its code or assets into this project. Playfield currently uses original text-symbol tiles and a small layered teaching layout, not a full 144-tile Mahjong ruleset.

## 07. Run and Verify

Run `python3 -m http.server 8000` from the workspace and open the forwarded port in Codespaces. `localhost` inside the container may not resolve in the host browser. There is no `npm run build`; this project has no `package.json` or build step.

Quick checks:

```sh
node --check app.js
node --check sw.js
node --check wallet.js
node --check store.js
node --check rng.js
node --check history.js
node --check stats.js
node --check economy.js
node --check daily.js
node --check feedback.js
for file in games/*.js; do node --check "$file"; done
node --test tests/games.test.js
```

## 08. Known Limits and Next Steps

- Sudoku now generates seeded, difficulty-graded puzzles with pencil notes, same-number highlight, and mistake counting. Next: an explicit "check for mistakes" action and per-difficulty best times.
- Word Search has Easy/Medium/Hard grid sizes and word sets with drag and tap selection. Keep the endpoint completion test when editing word data or generation rules.
- Solitaire supports draw-one and draw-three Klondike, tap and drag moves, double-tap to foundation, an auto-complete sweep, and dead-end detection, but is not yet a complete tournament-ready implementation.
- Mahjong is a small layered matching tutorial with dead-end detection and reshuffle, not a full 144-tile layout catalogue.
- The daily challenge currently covers Sudoku only; extend `daily.js` seeds to other games when ready.
- 2048 and Memory are new, seeded, touch-first games. 2048 win detection marks the board solved at 2048 but keeps playing on request; Memory flips mismatches back after a delay and uses a timer to avoid a stale flip clearing a new pair.
- Stats and the daily streak live in the local save. Cross-device sync and Supabase accounts are planned but not implemented; keep `store.js` as the single persistence seam.
- Verify touch layout and pointer drag on a real phone; automated visual browser testing is not currently configured, though Playwright can drive the served app locally.
- Browser/PWA deployment is not a native Android/iOS/desktop/console package. Cross-device sync and console certification need separate product decisions.