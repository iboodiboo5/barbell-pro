# AGENTS.md

OK Barbell — iOS-first PWA workout companion (Calculator, Tracker, Notes, Analytics). Zero dependencies, no build step, offline-capable.

## Tech Stack

- Vanilla JS (ES6+), single HTML file, one CSS file, Service Worker
- Global object literals with `init()` methods — no classes, no frameworks, no npm
- localStorage via `Storage` wrapper (all keys prefixed `barbellPro_`)
- Web Audio API for synthesized sounds, Canvas API for charts

## Architecture

| File | Modules | Role |
|------|---------|------|
| `app.js` | Storage, Toast, Utils, Haptics, Sound, RestTimer, Notes, App | Shell + shared utilities |
| `calculator.js` | Calculator | Barbell weight calculator with visual plate rendering |
| `tracker.js` | Tracker | Workout parser, CRUD, swipe gestures (~1,700 lines, most complex) |
| `analytics.js` | Analytics | Canvas charts, consistency tracker, 1RM/DOTS calculators |
| `index.html` | — | All markup, modals, tab bar |
| `styles.css` | — | Design system: 40+ CSS custom properties in `:root` (~2,600 lines) |
| `sw.js` | — | Service Worker, cache-first strategy |

## Critical Rules

- **Bump `CACHE_NAME` in `sw.js`** after ANY change to JS/CSS/HTML — forgetting breaks offline updates
- **Syntax check** with `node -c <file>.js` before committing
- **No external dependencies** — no CDN, no npm, no imports. Everything is vanilla JS
- **No build step** — files served directly, no transpilation

## Patterns That Break If Violated

- **Wall-clock timer**: RestTimer uses `_endTime` (absolute `Date.now()` timestamp). **Never use interval-based countdown** — it drifts on iOS background tabs
- **HiDPI canvas**: `drawLineChart` calls `ctx.scale(dpr, dpr)` once. **Helper methods must NOT re-scale** — double-scaling distorts everything
- **Event listener guards**: Use `_bound` flag pattern to prevent duplicate listeners on re-rendered containers (see `_renderPresets`, `_bindLiftSearch`)
- **Targeted DOM updates**: Completion toggle uses `classList.toggle()` on the specific card. **Never call `renderExercises()` for a single toggle** — it kills swipe state
- **Two-stage deletion**: Weeks require long-press → "Delete?" pill → modal confirm (`#deleteConfirmModal`). Days require long-press → "Delete?" label → tap confirm
- **Add-day tab**: The "+" tab is dynamically rendered. **Guard from long-press delete** with `.add-day-tab` class check

## Conventions

- **Modals**: Bottom-sheet pattern — `.modal-overlay.active` toggling with slide-up animation
- **Feedback**: Always use `Sound.*()` and `Haptics.*()` wrappers — never call `navigator.vibrate()` or Web Audio directly
- **CSS tokens**: Add new colors/spacing to `:root` — use `var(--token)` everywhere
- **Accessibility**: All interactive elements need `aria-label`
- **Notes tab**: Uses flex layout with `#tab-notes` ID selector to override `.tab-content.active { display: block }`

## Data Format

Workouts: `barbellPro_workouts` → `{ weeks: [{ id, label, days: [{ dayName, date, exercises: [{ id, name, load, sets, reps, remarks[], completed }] }] }], currentWeekIndex }`

## localStorage Keys

`barbellPro_workouts`, `barbellPro_sound`, `barbellPro_haptics`, `barbellPro_notes`, `barbellPro_bodyWeight`, `barbellPro_bodyWeightUnit`, `barbellPro_longPressHinted`, `barbellPro_lastRestTime`, `barbellPro_pillCorner`, `barbellPro_calculator`

## Deeper Context

Claude Code users: see `.claude/rules/` for path-scoped guidance on tracker, analytics, and timer subsystems.
