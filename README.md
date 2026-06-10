# Barbell Pro

A mobile-first workout companion PWA — plan training weeks, run live workouts from your phone at the bench, and track PRs, consistency and bodyweight over time. Complete ground-up rebuild of the original OK Barbell app.

Everything is offline-first: Dexie (IndexedDB) is the single source of truth, the service worker caches the app shell, and the whole thing installs to the home screen like a native app.

## Features

- **Train** — weeks → days → exercises with drag-reorder, swipe-delete, one-tap week duplication, and lift-name autocomplete backed by a fuzzy-matching lift catalog.
- **Live workout** — full-screen set logger with weight/reps steppers, last-session reference, wall-clock rest timer, PR detection with confetti, and a count-up session summary. Interrupted sessions resume on relaunch.
- **Lifts** — per-lift history with 1/3/5RM + estimated 1RM (Epley) PR cards and a self-drawing progress chart.
- **Stats** — weekly consistency streak vs. a configurable target, volume trend, bodyweight log, DOTS score.
- **Notes** — quick free-form notes with swipe-delete and undo.
- **Plate calculator** — tap any weight anywhere; color-coded plates animate onto the bar.
- **Backup** — JSON export/import (all-or-nothing restore with preview), plus an importer for the legacy OK Barbell format.

## Development

```bash
npm install
npm run dev        # vite dev server
npm test           # vitest unit tests
npm run build      # tsc -b && vite build
npm run preview    # serve the production build
node scripts/make-icons.mjs   # regenerate PWA icons from public/icons/icon.svg
```

## Deploying

The build output in `dist/` is fully static — host it anywhere (GitHub Pages, Netlify, Cloudflare Pages, …). Serve over HTTPS so the service worker and install prompt work. No backend required.

## Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Motion 12 · Zustand 5 · Dexie 4 · vite-plugin-pwa · Vitest 3
