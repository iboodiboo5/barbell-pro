# Barbell Pro

Offline-first workout PWA — plan training weeks, log live sessions from the bench, and track PRs, consistency and bodyweight. Installs to the home screen; all data lives on-device (IndexedDB), no backend.

**Highlights:** paste whole weeks straight from a coach's Excel/Google sheet (dates, loads, sets × reps and comments are parsed automatically) · live workout mode with wall-clock rest timer and PR confetti · per-lift history with 1/3/5RM + estimated 1RM charts · weekly consistency streak and DOTS score · contextual plate calculator · JSON backup/restore (imports v1 data too).

## Development

```bash
npm install
npm run dev      # dev server
npm test         # vitest
npm run build    # tsc + vite build
```

Deploy `dist/` to any static host over HTTPS.

React 19 · TypeScript · Vite · Tailwind 4 · Motion · Zustand · Dexie
