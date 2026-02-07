# KK Barbell — Project Guide

## What This Is

KK Barbell is a PWA workout companion app with 4 tabs: Calculator, Tracker, Notes, Analytics. Built for iOS home screen use. Dark theme, offline-first, zero dependencies.

## Tech Stack

- **Vanilla JS** — no frameworks, no build tools, no npm
- **Single-page app** — tab switching via CSS class toggling
- **localStorage** — all persistence via `Storage` utility wrapper (keys prefixed `barbellPro_`)
- **Service Worker** — cache-first offline strategy, versioned cache (`kk-barbell-v9`)
- **Web Audio API** — synthesized sound effects (no audio files)

## Architecture

Global object literals with `init()` methods, loaded via `<script>` tags:

| File | Module(s) | Purpose |
|------|-----------|---------|
| `app.js` | `Storage`, `Toast`, `Utils`, `Haptics`, `Sound`, `Settings`, `Notes`, `App` | App shell, shared utilities, feedback systems, body weight setting |
| `calculator.js` | `Calculator` | Barbell weight calculator with visual barbell, proportional plate widths |
| `tracker.js` | `Tracker` | Workout parser (tab-separated Google Sheet format), CRUD, Spotify-style swipe gestures |
| `analytics.js` | `Analytics` | Canvas charts with tap tooltips, consistency tracking, lift progression, 1RM & DOTS calculators |
| `index.html` | — | All markup, modals, tab bar |
| `styles.css` | — | Full design system with 40+ CSS custom properties in `:root` |
| `sw.js` | — | Service worker with cache versioning |

## Key Patterns

- **Event delegation** on containers (e.g., `exerciseList`, `plateButtons`, `dayTabs`)
- **Bottom-sheet modals** with `.modal-overlay.active` toggling, slide-up/down animations
- **Spotify-style swipe gestures**: swipe right (elastic, spring-back) = complete, swipe left (lock at 80px, 3s auto-reset) = reveal delete
- **Long-press** (500ms) = delete mode for weeks/days; 200ms visual hint (scale+opacity); one-time tooltip on first use
- **Targeted DOM updates** for completion toggle — `classList.toggle()` on specific card, no full re-render
- **Compound lift detection** via `LIFT_GROUPS` aliases + `BARBELL_COMPOUNDS` list
- **Smart lift sorting** in analytics — recent frequency (last 6 weeks) with 1.5x compound bias
- **Interactive charts** — tap for tooltips with dashed indicator line + highlight dot, 4s auto-dismiss
- **Parser** handles tab-separated workout data with text-based loads, header-row remarks, exercise boundary detection
- **Feedback**: `Haptics._vibrate()` (degrades silently on iOS), `Sound._play()` via OscillatorNode + GainNode
- **iOS AudioContext** — persistent resume listeners on touchstart/touchend/click, explicit resume before every `_play()`
- **Undo delete**: 5-second toast with restore capability

## Important Constraints

- **No external dependencies** — everything must stay vanilla JS, no CDN, no npm
- **No build step** — files are served directly, no bundling or transpilation
- **iOS-first** — all touch interactions, safe area insets, viewport-fit=cover
- **Offline-capable** — all assets precached by service worker
- **Cache versioning** — bump `CACHE_NAME` in `sw.js` on every deployment
- **HiDPI canvas** — `drawLineChart` applies `ctx.scale(dpr, dpr)` once; helper methods like `_drawIndicatorLine` must NOT re-scale

## When Modifying

- After changing any JS/CSS/HTML file, bump the cache version in `sw.js` (`kk-barbell-vN`)
- Syntax check with `node -c <file>.js` before committing
- The parser in `tracker.js` is the most complex code (~400 lines) — test with real Google Sheet data
- `styles.css` uses `var(--token)` everywhere — add new colors/spacing to `:root`
- Modals follow the bottom-sheet pattern — reuse `.modal-overlay` + `.modal` classes
- All interactive elements need `aria-label` attributes
- Sound/haptic calls go through `Sound.*()` and `Haptics.*()` — never call `navigator.vibrate()` directly
- Swipe gestures use elastic physics (resistance + overshoot) — see `setupSwipeHandlers()` constants
- Canvas chart helpers share coordinate space with `drawLineChart` — never add redundant `ctx.scale()`
- Completion toggle must use targeted DOM update — never call `renderExercises()` for single toggle
- Notes tab uses flex layout with `#tab-notes` ID selector to override `.tab-content.active { display: block }`

## Data Format

Workouts are stored as:
```json
{
  "weeks": [
    {
      "id": "...",
      "label": "Week 1",
      "days": [
        {
          "dayName": "Monday",
          "date": "2025-12-15",
          "exercises": [
            {
              "id": "...",
              "name": "Bench Press",
              "load": "60",
              "sets": "5",
              "reps": "5",
              "remarks": ["Easy", "Good form"],
              "completed": true
            }
          ]
        }
      ]
    }
  ],
  "currentWeekIndex": 0
}
```

## localStorage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `barbellPro_workouts` | Object | All workout data (weeks, days, exercises) |
| `barbellPro_sound` | Boolean | Sound enabled/disabled |
| `barbellPro_haptics` | Boolean | Haptics enabled/disabled |
| `barbellPro_notes` | String | Notes tab content |
| `barbellPro_bodyWeight` | Number | User's body weight (for DOTS calculator) |
| `barbellPro_bodyWeightUnit` | String | `'kg'` or `'lb'` |
| `barbellPro_longPressHinted` | Boolean | Whether long-press tooltip has been shown |

## File Sizes

~5,900 lines total across 7 code files. `styles.css` is the largest (~2,340 lines), followed by `tracker.js` (~1,540 lines) and `analytics.js` (~800 lines).
