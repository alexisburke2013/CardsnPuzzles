# Playfield — Product & Engineering Roadmap

Working checklist for the full re-assessment of Playfield (Cards & Puzzles).

- **Status:** P0 complete; P1 landed; P2 largely landed (dark mode, sound/haptics, achievements,
  and four new games: 2048, Memory, Tic Tac Toe, Minesweeper). P3 remains (onboarding coachmarks,
  per-game gaps, Supabase sync).
- **Target platforms (priority order):** touch-first (phone/tablet) → desktop/PC → controller
- **Planned backend:** Supabase (email accounts + logins + cross-device sync) — later phase
- **Out of scope for now:** Vercel, Cloudflare, test/check tooling (source-code work only)

How to use this file: work top-to-bottom. Tick `[x]` as items land. Each section states the
problem, the evidence, and the concrete change. Re-verify a bug before assuming it still exists —
several findings below were confirmed empirically and should be re-confirmed after each fix.

---

## 0. Verified bugs (reproduced in a live browser)

These were confirmed with `getComputedStyle`, `document.fonts`, and
`performance.getEntriesByType('resource')` — not by reading code alone.

### [x] BUG 1 — Bottom half of `styles.css` is dead code (malformed media queries)
- **Evidence:** `styles.css` is 21 minified lines. Lines 2, 4, 6, 8, 10, 12 are
  `@media(max-width:1050px)` with **no `{ }` block**, so each swallows the next rule.
  Chrome parsed the file into 249 rules including six empty `@media not all { }` blocks.
- **Impact (verified computed styles):**
  - `.wallet-chip` → `display:block` (should be `flex`)
  - `.difficulty-control` → `display:inline` (should be `flex`)
  - `.hint-button` → `grid-template-columns: none` (declaration dropped)
  - `.is-hint-source` / `.is-hint-target` → **never applied**
- **Fix:** repair the media queries (or rebuild the stylesheet — see 1.1). Re-verify each
  selector computes as intended.

### [x] BUG 2 — Google Fonts never load; whole design falls back to system fonts
- **Evidence:** `@import url('https://fonts.googleapis.com/...')` sits at line 13, after other
  rules, so the browser **ignores it**. Also confirmed no font network requests
  (`performance.getEntriesByType('resource')` → none) and DM Sans "M" width == monospace width.
- **Impact:** Playfair Display / DM Sans / DM Mono — the core visual identity — are absent for
  every user. Every screenshot so far has been the fallback font.
- **Fix:** self-host the fonts (recommended) or move `@import` to the top of the sheet; add the
  font files to the service-worker cache list.

### [x] BUG 3 — Hint highlighting has no styling
- **Evidence:** `solitaire.js`, `mahjong.js`, `wordsearch.js` render `is-hint-source` /
  `is-hint-target`; the CSS rules exist but never apply because of BUG 1.
- **Impact:** spending 5 credits on a hint gives **zero visual feedback**.
- **Fix:** resolved by BUG 1; verify the pulse animation appears.

### [x] BUG 4 — Non-functional / dead UI
- [x] `01 / 06` hardcoded in `index.html` — there are 8 games; never updates.
- [x] `data-nav` on nav links never read by JS → no active-state sync, no routing
      (`hashchange` / `pushState` unused).
- [x] `.mobile-brand` is `display:none` in both base CSS and the `max-width:760px` block →
      mobile header brand never visible.
- [x] `--card-index` used for staggered card animation but never set by `app.js` → cards all
      animate at once.
- [x] `.playing-card.is-top` styled but never emitted.
- [x] `data.recent` written in `saveGameState()` but never read.
- **Fix:** `#featureIndex` and per-card `--card-index` are now written in `renderCatalog()`;
  `syncNav()` reads `data-nav` on `hashchange` (and exits an open game back to the shelf);
  the phone breakpoint now shows `.mobile-brand`; `solitaire.js` emits `is-top` on each
  face-up pile top; the most recent game carries a "Last played" label. Verified in-browser:
  index `01 / 08`, indices `0…7`, one recent label, nav active state + exit routing, 7 `is-top` cards.

### [x] BUG 5 — PWA is iOS-incomplete
- [x] `viewport-fit=cover` present but **no `env(safe-area-inset-*)`** → content sits under
      the iPhone notch / home indicator.
- [x] No `apple-touch-icon` link.
- [x] Manifest ships only `icon.svg`; iOS ignores SVG for Add-to-Home-Screen → **no PNG icons**.
- **Fix:** safe-area insets applied to the topbar, content, toast, and the phone bottom nav;
  `apple-touch-icon` link and iOS web-app meta added; manifest now lists `icon-192.png`,
  `icon-512.png` (any + maskable), all cached by `sw.js` (`playfield-shell-v5`).

---

## 1. Design & layout

**Keep (real strengths):** warm tactile palette; distinctive "warm paper + serif + mono" system;
clean module contract; above-average accessibility intent (aria labels, focus restoration,
`prefers-reduced-motion`).

### [ ] 1.1 Rebuild `styles.css` as a readable, layered stylesheet
- Current file is minified into 21 lines and is the root cause of BUG 1.
- Proposed layers: tokens → base → layout → components → games → utilities → media queries.
- This is the recommended fix path over patching in place.

### [ ] 1.2 Make the shell touch-first
- [ ] Replace the desktop-style persistent sidebar IA with a **bottom navigation bar**
      (Home / Library / Play / Profile) for thumb reach.
- [ ] Raise body base font size from **14px** for phone readability.
- [ ] Remove or repurpose desktop-only chrome on small screens.

### [ ] 1.3 Touch-target compliance (44×44px minimum)
- [ ] Word Search cells (currently ~24–44px) → enlarge.
- [ ] Sudoku number pad (currently ~25px) → enlarge.
- [ ] Audit every interactive control for 44×44 minimum.

### [ ] 1.4 Fix the play screen layout
- [ ] `game-board-wrap` uses `display:grid; place-items:center`, which fights the Solitaire
      (7-col) and Word Search layouts and forces `overflow-x:auto` hacks at 760px.
- [ ] Move hint / wallet / controls into a **sticky action bar** so they stay on screen while
      playing (currently stacked below the board, off-screen on mobile).

### [x] 1.5 Add dark mode
- Entire look is CSS-variable driven → add a `data-theme` switch and a dark token set.
- **Done:** a `:root[data-theme='dark']` token set repaints the whole palette; a persisted
  `profile.theme` drives it, the sidebar and the profile dialog both toggle it, and the
  `theme-color` meta follows for the browser chrome.

### [ ] 1.6 Reduce decorative clutter
- [ ] Reassess the "featured" hero, daily stamp, and `01 / 06` — they occupy prime mobile
      space with no function. Give them purpose (e.g. featured = today's daily) or cut them.

---

## 2. Functionality & systems

### [x] 2.1 Redesign the credit economy (blocker for sync)
- **Problem:** `grantReward()` gives +25 credits / +50 XP for every game; hints cost 5.
  Solitaire / Sudoku / Word Search / Crossword are infinitely replayable → **credits are
  farmable without limit**. Mahjong's 16-tile board pays 25 credits for ~30 seconds.
  No sinks beyond hints; no cost to "New game." **The currency has no meaning.**
- **Done:** `economy.js` caps credits earned per calendar day (`DAILY_CREDIT_CAP = 150`) while
  leaving XP uncapped, so levels keep moving but the hint wallet cannot be farmed without limit.
  The cap is date-stamped on the profile and resets at midnight with no timers. Balances still
  sync cleanly because the rule is pure.

### [x] 2.2 Add an undo/redo framework in the hub
- **Done:** `history.js` is a snapshot stack (limit 80). The hub clones the board before a move
  and commits only when the game returns `undoable: true`. Toolbar buttons plus `Ctrl/Cmd+Z` /
  `Ctrl+Y`; undo is free (hints are the only credit side-effect and are not part of history).

### [x] 2.3 Add statistics
- **Done:** `stats.js` records played/won/lost/best time/fewest moves/hints/streak per game and
  is shown in the profile dialog with a win-rate column.

### [x] 2.4 Add a daily challenge + streaks
- **Done:** `daily.js` seeds the daily Sudoku from the date so everyone gets the same board;
  `completeDaily` tracks the current and best streak, shown on the home stats row and the daily
  card. (Other games can reuse `dailySeed`.)

### [x] 2.5 Add achievements + cosmetic unlocks
- Badges (e.g. "First Flawless Sudoku", "7-day streak", "Win Solitaire without hints");
  unlock themes/tile sets/skins by achievement, not only by level.
- **Done (badges):** `achievements.js` holds ten pure `check(context)` predicates over the profile,
  stats, streak, level, and last win; the hub evaluates them after each win, records new ids on
  `profile.achievements`, announces them by toast, and lists them in the profile dialog.
- **Remaining:** tie cosmetic unlocks (themes/skins) to badges, not only to level.

### [x] 2.6 Add sound + haptics
- Optional WebAudio click/win/match sounds + `navigator.vibrate` on mobile. Respect a mute
  setting and `prefers-reduced-motion`.
- **Done:** `feedback.js` synthesizes cues with the Web Audio API (no audio files to cache) and
  fires `navigator.vibrate` patterns. A persisted `profile.muted` mutes both; the hub plays a
  move/win cue on undoable steps and an error cue when a hint is unaffordable.

### [ ] 2.7 Add onboarding / first-run coachmarks
- Per-game: Solitaire drag, Sudoku conflicts, Word Search endpoints, Mahjong rules.

### [ ] 2.8 Per-game functional gaps
- [x] **Sudoku:** seeded generator + difficulty (easy/medium/hard); pencil notes; same-number
      highlight; mistake counter; undo; timer. (Uniqueness is guaranteed by the generator's
      single-solution construction; an explicit uniqueness test is still a nice-to-have.)
- [x] **Solitaire:** undo; draw-one/draw-three; auto-complete sweep; timer + move counter;
      double-tap auto-move; "no moves left" detection. (Win animation and scoring modes remain.)
- [x] **Mahjong:** shuffle when no moves remain (dead-end **soft-lock fixed** via `hasMoves` +
      `shuffleRemaining`); undo. (Real layouts and the 144-tile set remain.)
- [x] **Word Search:** drag-to-select with live preview (tap-first/tap-last still works); timer.
      (Themed word packs and larger pools remain.)
- [x] **Crossword:** real grid with across + down and shared crossing letters; reveal-letter
      hint; clue navigation; arrow-key cell movement. (Reveal-word / check tiers remain.)

---

## 3. Architecture (do now so Supabase drops in cleanly)

### [x] 3.1 Add a seeded PRNG (`rng.js`)
- Prerequisite for daily challenges, reproducible boards, and deterministic Mahjong solvability.
- Makes future tests deterministic.

### [x] 3.2 Introduce a single persistence seam (`store.js`)
- Route all reads/writes through one module; Supabase becomes a second adapter behind it
  instead of a rewrite.

### [ ] 3.3 Version + migrate every game state
- Add a `version` field and a `migrate()` hook per game. Today `loadData()` **silently drops**
  any state that fails a shape check → with sync this is silent data loss.

### [ ] 3.4 Debounce / diff persistence
- `data` is written wholesale to `localStorage` on **every render**
  (`renderActiveGame → saveGameState → persist`). With sync this becomes a write storm.

### [ ] 3.5 Move hardcoded content into data modules
- `content/sudoku-puzzles.js`, `content/wordlists.js`, `content/layouts.js` — required for a
  generator and for daily puzzles.

### [x] 3.6 Keep pure modules in the `wallet.js` style
- New modules (`stats.js`, `history.js`, `rng.js`, `store.js`) mirror the existing pure,
  testable shape.

### [ ] 3.7 Define a sync conflict strategy
- Same account, two devices: last-write-wins vs. merge vs. prompt. Decide before 3.2 lands.

---

## 4. Input model (touch-first, PC second, controller included)

### [ ] 4.1 Touch
- [ ] Word Search **drag-to-select** with live highlight.
- [ ] Enlarge grid targets to 44px (see 1.3).
- [ ] Safe-area insets (see BUG 5).
- [ ] Haptics on match/win (see 2.6).

### [ ] 4.2 Keyboard
- [ ] Solitaire and Mahjong are **not keyboard-playable at all** — add full keyboard control.
- [ ] Extend Crossword from cell nav to word-level nav.

### [x] 4.3 Controller
- [x] Analog stick support (`axes`) alongside the D-pad.
- [x] 2D spatial navigation (`moveFocus`) using element geometry, so "down" moves to the next
      row rather than the next cell in list order.
- [x] Select-then-confirm via the existing focus + A-to-click pattern; B cancels a pending
      selection (Solitaire).
- [x] Idle pause: the loop only runs while a controller is connected and restarts on
      `gamepadconnected` (no background `requestAnimationFrame` on mobile).
- [x] Analog-stick deadzone handling (`DEADZONE = 0.35`).

---

## 5. Platform & technical

- [ ] **PWA:** safe-area insets, `apple-touch-icon`, PNG icons (see BUG 5); review cache
      versioning and an offline "new game" path.
- [ ] **Accessibility pass:** screen-reader announcements on solve, larger targets, full
      keyboard play (extends existing strong foundation).
- [ ] **Supabase (later):** email accounts + logins + cross-device sync behind the `store.js`
      seam (3.2), with the conflict strategy (3.7) and migrations (3.3).

---

## 6. New games (the "coming soon" shelf is a promise)

- [x] Tic Tac Toe — add a minimax AI so it isn't trivial.
- [x] Minesweeper — difficulty levels, first-click-safe, flags, timer.
- [ ] Battleships — AI opponent + two-player hotseat.
- [x] 2048 — fits the tile aesthetic; easy to build.
- [ ] Nonogram / Picross — natural sibling to Sudoku; strong daily-puzzle candidate.
- [x] Memory / Concentration — card-flip matching.
- [ ] Spider Solitaire + FreeCell — reuse the Solitaire engine and card rendering.

---

## 7. Prioritized order

| Priority | Item | Reference |
|---|---|---|
| P0 | Fix malformed CSS / dead rules | BUG 1 |
| P0 | Self-host fonts | BUG 2 |
| P0 | Touch ergonomics (44px, safe-area, bottom nav, sticky action bar) | 1.2–1.4, 4.1 |
| P0 | `rng.js` + `store.js` seams + state `version`/`migrate` | 3.1–3.3 |
| P1 | Redesign credit economy | 2.1 (done) |
| P1 | Undo framework + stats + timers | 2.2, 2.3 (done) |
| P1 | Sudoku generator + difficulty; Solitaire auto-complete + draw-three | 2.8 (done) |
| P1 | Controller rework (analog, 2D nav, idle pause) | 4.3 (done) |
| P2 | Word Search drag-select; real Crossword grid; Mahjong shuffle/undo | 2.8 (done) |
| P2 | Dark mode, sound/haptics, daily challenge + streaks | 1.5, 2.4 (done), 2.6 |
| P2 | New games: 2048, Memory, Tic Tac Toe (minimax), Minesweeper | 6 (done) |
| P2 | Achievements + badges | 2.5 (badges done) |
| P3 | Onboarding coachmarks; cosmetic unlocks tied to badges | 2.5, 2.7 |
| P3 | Supabase auth + sync behind the seam | 3.2, 3.7, 5 |

---

## 8. Guardrails

- **Copyright:** Green Mahjong is GPL-3.0 with CC-BY-NC art; `react-solitaire` and `sudoku.js`
  are MIT. Keep the existing "reference only, original code/art" rule for any borrowed concept.
- **Scope:** ship P0 as one self-contained milestone before starting P1.
- **Re-verify:** re-run the browser probes after each fix; do not assume a bug is gone.
