# Playfield Agent Memory

This file is the project orientation for coding agents. Read the relevant chapter before changing a game, input flow, or save format. Headings are intentionally stable for quick search and indexing.

## 00. Project Snapshot

Playfield is a browser-first PWA hub for short card and puzzle games. It is a static ES-module app with no bundler or runtime dependencies. The app should feel warm, tactile, playful, and usable on phone, tablet, desktop, keyboard, mouse, touch, and gamepad.

## 01. Source Map

- `index.html`: shared hub and game-shell markup. The app script must remain `type="module"`.
- `app.js`: catalog, profile progression, local persistence, rewards, game lifecycle, PWA install, backup/restore, and cross-game input dispatch.
- `wallet.js`: the shared earn/spend/legacy-migration rules for the player credit balance.
- `games/hints.js`: shared hint price and disabled-state button markup.
- `games/index.js`: registry for playable modules and metadata for coming-soon games.
- `games/solitaire.js`: deal, move validation, click/tap, pointer drag/drop, and Solitaire rendering.
- `games/sudoku.js`: puzzle seed, editable-cell rendering, number entry, conflict feedback, and keyboard navigation.
- `games/mahjong.js`: layered tile layout, blocked/open rules, matching, and hints.
- `games/wordsearch.js`: difficulty configuration, word placement generation, state validation, and endpoint selection.
- `games/crossword.js`: clue data, editable rows, and completion checks.
- `styles.css`: shared design system, responsive layouts, game pieces, and motion.
- `sw.js`: versioned offline shell cache. Add every new module to `APP_FILES`.

## 02. Game Module Contract

Each game exports a default module with `metadata`, `createState()`, and `render(state, options)`. Rendering returns `{ board, aside }` HTML strings. Optional event handlers are `handleClick(target, state, helpers)`, `handleInput(target, state)`, `handleKeyDown(event, state)`, and pointer handlers. Return `true` or `{ changed: true, focus }` when the app should rerender. `helpers.toast(message)` gives feedback; `helpers.complete(gameId)` awards progression; `helpers.spendCredits(amount)` is the only game-facing wallet spend API.

Game state must be JSON-serializable. Do not save DOM nodes, PointerEvents, timers, or other transient browser objects. The Solitaire drag object is transient and must be cleared on pointer-up/cancel before saving.

## 03. Add or Customize a Game

1. Create `games/your-game.js` and add its default export to `games/index.js`.
2. Put its title, category, card art key, and shelf subtitle in `metadata`.
3. Keep rules and board state in that module; use the `CUSTOMIZE ... HERE` notes at the top of each game file as examples.
4. Add its module URL to `sw.js` so installed/offline clients cache it.
5. Add focused state/rule checks using Node's built-in assertions or a future test runner.

For content tweaks, edit the constants at the top of the corresponding module: Sudoku `PUZZLE` and `SOLUTION`, Word Search `DIFFICULTIES`/`WORDS`/`DIRECTIONS`, Crossword `CLUES` and `ANSWERS`, Mahjong `TILE_PAIRS`, Solitaire `SUITS` and its move validators. Keep generated Word Search placements as complete cell-index paths; `isValidState()` rejects legacy coordinate-pair saves. Adjust the shared hint price in `games/hints.js`. Use `styles.css` for visuals; do not put game rules in CSS.

## 04. Input and Accessibility Rules

- Prefer native input elements for text/number entry; keep `inputmode`, labels, focus restoration, and keyboard navigation working.
- Mouse drag must have a tap/click alternative. Touch drag uses Pointer Events and must handle `pointercancel`.
- Keep touch targets stable in size. Avoid hover-only instructions or state.
- Respect `prefers-reduced-motion`. Use animation to communicate a move, match, error, or reward, not as decoration alone.
- Preserve visible focus for keyboard and controller users.

## 05. Save and Progression Rules

Local saves live in `localStorage` under `playfield-save-v2`; the legacy v1 profile is still read. `wallet.js` migrates legacy `points` to `credits`; keep this migration and backup imports intact. When game state shapes change, validate saved boards in `restoreGameState()` in `app.js`; preserve profile XP, credits, titles, and cosmetics even if an old in-progress board must restart. Keep backups importable and versioned.

New profiles start with 15 credits. The shared reward is currently 25 credits and 50 XP per completed game; each game hint costs 5 credits. `app.js` owns wallet spending and reward-once logic; game modules signal completion and request hint spending but must not mutate the wallet directly.

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
for file in games/*.js; do node --check "$file"; done
node --test tests/games.test.js
```

## 08. Known Limits and Next Steps

- Current Sudoku uses one fixed puzzle; add a tested generator and difficulty levels before presenting daily/randomized play.
- Word Search has Easy/Medium/Hard grid sizes and word sets. Keep the endpoint completion test when editing word data or generation rules.
- Solitaire supports draw-one Klondike-style rules and single/sequence card moves, but is not yet a complete tournament-ready implementation.
- Mahjong is a small layered matching tutorial, not a full 144-tile layout catalogue.
- Verify touch layout and pointer drag on a real phone; automated visual browser testing is not currently configured.
- Browser/PWA deployment is not a native Android/iOS/desktop/console package. Cross-device sync and console certification need separate product decisions.