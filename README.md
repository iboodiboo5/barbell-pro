# Barbell Pro

Offline-first workout PWA — plan training weeks, log live sessions from the bench, and track PRs, consistency and bodyweight. Installs to the home screen; all data lives on-device (IndexedDB), no backend.

**Highlights:** paste whole weeks straight from a coach's Excel/Google sheet — including side-by-side multi-week grids (dates, loads, sets × reps and comments are parsed automatically) · swipe right on a planned exercise to log a set without starting a session · live workout mode with wall-clock rest timer, auto-advance and PR confetti · per-lift history with 1/3/5RM + estimated 1RM charts, stats (consistency streak, volume, DOTS) one toggle away · interactive plate calculator with mixed kg/lb plates · inline autosaving notes · JSON backup/restore (imports v1 data too).

## Development

```bash
npm install
npm run dev      # dev server
npm test         # vitest
npm run build    # tsc + vite build
```

Deploy `dist/` to any static host over HTTPS.

React 19 · TypeScript · Vite · Tailwind 4 · Motion · Zustand · Dexie
