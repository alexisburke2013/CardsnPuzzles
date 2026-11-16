# Playfield — Product & Engineering Roadmap

Working checklist for the full re-assessment of Playfield (Cards & Puzzles).

- **Status:** planning complete, implementation not started
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

### [ ] BUG 1 — Bottom half of `styles.css` is dead code (malformed media queries)
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

### [ ] BUG 2 — Google Fonts never load; whole design falls back to system fonts
- **Evidence:** `@import url('https://fonts.googleapis.com/...')` sits at line 13, after other
  rules, so the browser **ignores it**. Also confirmed no font network requests
  (`performance.getEntriesByType('resource')` → none) and DM Sans "M" width == monospace width.
- **Impact:** Playfair Display / DM Sans / DM Mono — the core visual identity — are absent for
  every user. Every screenshot so far has been the fallback font.
- **Fix:** self-host the fonts (recommended) or move `@import` to the top of the sheet; add the
  font files to the service-worker cache list.

### [ ] BUG 3 — Hint highlighting has no styling
- **Evidence:** `solitaire.js`, `mahjong.js`, `wordsearch.js` render `is-hint-source` /
  `is-hint-target`; the CSS rules exist but never apply because of BUG 1.
- **Impact:** spending 5 credits on a hint gives **zero visual feedback**.
- **Fix:** resolved by BUG 1; verify the pulse animation appears.

### [ ] BUG 4 — Non-functional / dead UI
- [ ] `01 / 06` hardcoded in `index.html` — there are 8 games; never updates.
- [ ] `data-nav` on nav links never read by JS → no active-state sync, no routing
      (`hashchange` / `pushState` unused).
- [ ] `.mobile-brand` is `display:none` in both base CSS and the `max-width:760px` block →
      mobile header brand never visible.
- [ ] `--card-index` used for staggered card animation but never set by `app.js` → cards all
      animate at once.
- [ ] `.playing-card.is-top` styled but never emitted.
- [ ] `data.recent` written in `saveGameState()` but never read.

### [ ] BUG 5 — PWA is iOS-incomplete
- [ ] `viewport-fit=cover` present but **no `env(safe-area-inset-*)`** → content sits under
      the iPhone notch / home indicator.
- [ ] No `apple-touch-icon` link.
- [ ] Manifest ships only `icon.svg`; iOS ignores SVG for Add-to-Home-Screen → **no PNG icons**.

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

### [ ] 1.5 Add dark mode
- Entire look is CSS-variable driven → add a `data-theme` switch and a dark token set.

### [ ] 1.6 Reduce decorative clutter
- [ ] Reassess the "featured" hero, daily stamp, and `01 / 06` — they occupy prime mobile
      space with no function. Give them purpose (e.g. featured = today's daily) or cut them.

---

## 2. Functionality & systems

### [ ] 2.1 Redesign the credit economy (blocker for sync)
- **Problem:** `grantReward()` gives +25 credits / +50 XP for every game; hints cost 5.
  Solitaire / Sudoku / Word Search / Crossword are infinitely replayable → **credits are
  farmable without limit**. Mahjong's 16-tile board pays 25 credits for ~30 seconds.
  No sinks beyond hints; no cost to "New game." **The currency has no meaning.**
- **Direction:** daily caps, earned-slowly "coins", ad/energy gating, or replay cost. Decide
  before Supabase, because balances will sync across devices.

### [ ] 2.2 Add an undo/redo framework in the hub
- Optional history stack; each game declares whether it's undoable. Solitaire undo must also
  reverse credit side-effects or be free.

### [ ] 2.3 Add statistics
- Per-game/per-difficulty: games won/lost, win %, best time, fewest moves, hints used,
  current + longest streak. Surface in the profile dialog.

### [ ] 2.4 Add a daily challenge + streaks
- Seeded daily puzzle per game; one canonical board per day; streak counter + calendar.
- Prerequisite: the seeded RNG (see 3.1).

### [ ] 2.5 Add achievements + cosmetic unlocks
- Badges (e.g. "First Flawless Sudoku", "7-day streak", "Win Solitaire without hints");
  unlock themes/tile sets/skins by achievement, not only by level.

### [ ] 2.6 Add sound + haptics
- Optional WebAudio click/win/match sounds + `navigator.vibrate` on mobile. Respect a mute
  setting and `prefers-reduced-motion`.

### [ ] 2.7 Add onboarding / first-run coachmarks
- Per-game: Solitaire drag, Sudoku conflicts, Word Search endpoints, Mahjong rules.

### [ ] 2.8 Per-game functional gaps
- [ ] **Sudoku:** puzzle generator + difficulty + uniqueness check; pencil marks / auto-notes;
      highlight same numbers; mistake limit; undo; timer.
- [ ] **Solitaire:** undo; draw-three; **auto-complete**; timer + move counter; win animation;
      double-tap auto-move; "no moves left" detection; scoring modes (Standard/Vegas/None).
- [ ] **Mahjong:** real layouts (Turtle/Pyramid/Dragon/Spider); standard 144-tile set; shuffle
      when no moves remain (currently a **soft-lock dead end**); undo; solvability guarantee.
- [ ] **Word Search:** **drag-to-select** (currently tap-first/tap-last only); themed word
      packs; larger word pools; timer.
- [ ] **Crossword:** real grid with **across + down** and crossing letters (currently 5
      across-only rows); reveal-letter / reveal-word / check tiers; word-level keyboard nav.

---

## 3. Architecture (do now so Supabase drops in cleanly)

### [ ] 3.1 Add a seeded PRNG (`rng.js`)
- Prerequisite for daily challenges, reproducible boards, and deterministic Mahjong solvability.
- Makes future tests deterministic.

### [ ] 3.2 Introduce a single persistence seam (`store.js`)
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

### [ ] 3.6 Keep pure modules in the `wallet.js` style
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

### [ ] 4.3 Controller (currently broken)
- [ ] Add **analog stick support** (`axes`); today only `buttons[12]/[13]` D-pad is read, so
      the stick does nothing on most pads.
- [ ] Build **2D spatial navigation** per board; today focus moves through a flat list, so
      "down" in Sudoku goes to the next cell instead of the next row.
- [ ] Add a shared **select-then-confirm** action pattern (Solitaire needs two presses:
      source then destination).
- [ ] Make destination piles focusable/selectable by D-pad.
- [ ] Add an **idle pause** to the gamepad loop — `pollGamepad` runs `requestAnimationFrame`
      forever even with no controller connected (battery drain on mobile).
- [ ] Analog-stick deadzone handling.

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

- [ ] Tic Tac Toe — add a minimax AI so it isn't trivial.
- [ ] Minesweeper — difficulty levels, first-click-safe, flags, timer.
- [ ] Battleships — AI opponent + two-player hotseat.
- [ ] 2048 — fits the tile aesthetic; easy to build.
- [ ] Nonogram / Picross — natural sibling to Sudoku; strong daily-puzzle candidate.
- [ ] Memory / Concentration — card-flip matching.
- [ ] Spider Solitaire + FreeCell — reuse the Solitaire engine and card rendering.

---

## 7. Prioritized order

| Priority | Item | Reference |
|---|---|---|
| P0 | Fix malformed CSS / dead rules | BUG 1 |
| P0 | Self-host fonts | BUG 2 |
| P0 | Touch ergonomics (44px, safe-area, bottom nav, sticky action bar) | 1.2–1.4, 4.1 |
| P0 | `rng.js` + `store.js` seams + state `version`/`migrate` | 3.1–3.3 |
| P1 | Redesign credit economy | 2.1 |
| P1 | Undo framework + stats + timers | 2.2, 2.3 |
| P1 | Sudoku generator + difficulty; Solitaire auto-complete + draw-three | 2.8 |
| P1 | Controller rework (analog, 2D nav, idle pause) | 4.3 |
| P2 | Word Search drag-select; real Crossword grid; Mahjong shuffle/undo/layouts | 2.8 |
| P2 | Dark mode, sound/haptics, daily challenge + streaks | 1.5, 2.4, 2.6 |
| P3 | Supabase auth + sync behind the seam | 3.2, 3.7, 5 |

---

## 8. Guardrails

- **Copyright:** Green Mahjong is GPL-3.0 with CC-BY-NC art; `react-solitaire` and `sudoku.js`
  are MIT. Keep the existing "reference only, original code/art" rule for any borrowed concept.
- **Scope:** ship P0 as one self-contained milestone before starting P1.
- **Re-verify:** re-run the browser probes after each fix; do not assume a bug is gone.
