# KK Barbell — Project Guide

## What This Is

KK Barbell is a PWA workout companion app with 4 tabs: Calculator, Tracker, Notes, Analytics. Built for iOS home screen use. Dark theme, offline-first, zero dependencies.

## Tech Stack

- **Vanilla JS** — no frameworks, no build tools, no npm
- **Single-page app** — tab switching via CSS class toggling
- **localStorage** — all persistence via `Storage` utility wrapper (keys prefixed `barbellPro_`)
- **Service Worker** — cache-first offline strategy, versioned cache (`kk-barbell-v7`)
- **Web Audio API** — synthesized sound effects (no audio files)

## Architecture

Global object literals with `init()` methods, loaded via `<script>` tags:

| File | Module(s) | Purpose |
|------|-----------|---------|
| `app.js` | `Storage`, `Toast`, `Utils`, `Haptics`, `Sound`, `Settings`, `Notes`, `App` | App shell, shared utilities, feedback systems |
| `calculator.js` | `Calculator` | Barbell weight calculator with visual barbell, mixed kg/lb plates |
| `tracker.js` | `Tracker` | Workout parser (tab-separated Google Sheet format), CRUD, swipe gestures |
| `analytics.js` | `Analytics` | Canvas charts, consistency tracking (date-based), lift progression |
| `index.html` | — | All markup, modals, tab bar |
| `styles.css` | — | Full design system with 40+ CSS custom properties in `:root` |
| `sw.js` | — | Service worker with cache versioning |

## Key Patterns

- **Event delegation** on containers (e.g., `exerciseList`, `plateButtons`, `dayTabs`)
- **Bottom-sheet modals** with `.modal-overlay.active` toggling, slide-up/down animations
- **Touch gestures**: swipe right = complete, swipe left = delete, long-press (500ms) = delete mode for weeks/days
- **Compound lift detection** via `LIFT_GROUPS` aliases + `BARBELL_COMPOUNDS` list
- **Parser** handles tab-separated workout data with text-based loads, header-row remarks, exercise boundary detection
- **Feedback**: `Haptics._vibrate()` (degrades silently on iOS), `Sound._play()` via OscillatorNode + GainNode
- **Undo delete**: 5-second toast with restore capability

## Important Constraints

- **No external dependencies** — everything must stay vanilla JS, no CDN, no npm
- **No build step** — files are served directly, no bundling or transpilation
- **iOS-first** — all touch interactions, safe area insets, viewport-fit=cover
- **Offline-capable** — all assets precached by service worker
- **Cache versioning** — bump `CACHE_NAME` in `sw.js` on every deployment

## When Modifying

- After changing any JS/CSS/HTML file, bump the cache version in `sw.js` (`kk-barbell-vN`)
- Syntax check with `node -c <file>.js` before committing
- The parser in `tracker.js` is the most complex code (~400 lines) — test with real Google Sheet data
- `styles.css` uses `var(--token)` everywhere — add new colors/spacing to `:root`
- Modals follow the bottom-sheet pattern — reuse `.modal-overlay` + `.modal` classes
- All interactive elements need `aria-label` attributes
- Sound/haptic calls go through `Sound.*()` and `Haptics.*()` — never call `navigator.vibrate()` directly

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

## File Sizes

~5,000 lines total across 8 code files. `tracker.js` is the largest (~1,370 lines).
