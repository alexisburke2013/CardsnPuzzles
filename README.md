# Playfield | Cards & Puzzles

Playfield is a browser-first home for short card and puzzle games. The shared hub keeps a player profile, wallet credits, XP, titles, cosmetics, and saved game boards together across the game shelf. Coding agents should start with [AGENTS.md](AGENTS.md), the chaptered project memory and customization guide.

## Playable preview

- Solitaire: draw-one or draw-three Klondike, facedown tableau cards, automatic flips, movable face-up runs, pointer drag/drop with tap fallback, double-tap to send a card home, an auto-complete sweep, a move counter, and “no moves left” detection.
- Sudoku: seeded puzzles with Easy/Medium/Hard difficulty, editable numeric cells, pencil notes, same-number highlighting, a mistake counter, conflict feedback, keyboard navigation, and a number pad for touch.
- Mahjong pairs: a small layered layout with covered/side-block rules, open-pair hints, matching feedback, and an automatic reshuffle when no pairs remain.
- Word search: generated horizontal, vertical, diagonal, and reverse placements, with Easy/Medium/Hard boards and drag-to-select (or tap-first/tap-last).
- Mini crossword: a real grid with across and down clues that share crossing letters, plus a reveal-letter hint.
- 2048: a seeded tile-merge puzzle with arrow keys, an on-screen pad, and board swipe on touch; reaching 2048 marks the win but you can keep playing.
- Memory: a seeded card-flip matching game with Easy/Medium/Hard pair counts; a matched pair is one undoable move.
- Tic Tac Toe, Battleships, and Minesweeper appear as coming soon.

New profiles start with 15 credits. Completing a game awards 25 credits and 50 XP; a hint in any starter game costs 5 credits from the same wallet. Credits earned per day are capped so the wallet cannot be farmed without limit, while XP stays uncapped so levels keep moving. Levels unlock player titles and four equippable Solitaire card backs.

Each game has a timer, undo/redo (toolbar or `Ctrl/Cmd+Z` / `Ctrl+Y`), and per-game statistics shown in the profile dialog. A seeded **daily Sudoku** gives everyone the same board each day and tracks a day streak. A **dark mode** toggle and a **sound/haptics** toggle are saved with the profile. Progress, statistics, streaks, and in-progress boards are stored in this browser on this device. Use **Back up progress** to download a JSON backup, or **Restore backup** to import one. Clearing browser storage can erase the local save, so keep a backup if the data matters.

## Customize and test

Each game owns its rules and board in a separate file under [`games/`](games/). The hub owns shared profile, save, reward, and input routing. Each module has a `CUSTOMIZE ... HERE` note at the top; [`AGENTS.md`](AGENTS.md) documents the module contract and how to register a new game.

Run the rule checks with Node's built-in test runner:

```sh
node --test tests/games.test.js
```

## Run locally

Serve the project over HTTP so the service worker and PWA features can work:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). The app shell is cached for offline use after the first visit. The current project has no build step or third-party runtime dependencies.

## Install and controls

The responsive web app supports touch, mouse, keyboard, and gamepad. Sudoku supports arrow keys and number keys; the crossword supports arrow keys between cells. On a controller, the D-pad or analog stick moves focus in two dimensions, A selects the focused control, and B cancels a pending selection. The gamepad loop only runs while a controller is connected.

- Android and desktop Chromium browsers can offer the in-browser **Install** action.
- On iPhone or iPad, open the site in Safari, choose **Share**, then **Add to Home Screen**.
- Other modern browsers can run the site directly; install prompts depend on browser support and how the site is hosted.
- Console browsers and controllers vary by platform. This is a web/PWA preview, not a native console package; console certification, native builds, and full controller-specific UX are future work.

## Open-source comparisons

- [react-solitaire](https://github.com/gcedo/react-solitaire) (MIT) uses drag-and-drop and explicit state-management/testing patterns. Playfield now uses pointer-based dragging plus tap fallback in a framework-free module.
- [sudoku.js](https://github.com/robatron/sudoku.js) (MIT) separates puzzle generation and solving from its UI. Playfield keeps Sudoku rules in its own module and now ships a seeded generator/solver (`games/sudoku-generator.js`).
- [Green Mahjong](https://github.com/danbeck/green-mahjong) offers multiple layouts/themes and mobile browser support. Its code is GPL-3.0 and its artwork is CC-BY-NC, so Playfield only uses it as a design reference and does not reuse its code or art.

These games are still compact prototypes, not complete implementations of every classic ruleset. See [AGENTS.md](AGENTS.md) for module conventions, customization notes, verification commands, and the prioritized limits.