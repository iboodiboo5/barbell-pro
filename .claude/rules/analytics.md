---
paths:
  - "analytics.js"
---

# Analytics Module

## Canvas Charts
- **HiDPI**: `drawLineChart` calls `ctx.scale(dpr, dpr)` once at setup. All helper methods (`_drawIndicatorLine`, etc.) share this coordinate space — adding another `ctx.scale()` will double-scale and distort rendering
- **Interactive tooltips**: Tap triggers dashed indicator line + highlight dot, 4s auto-dismiss timer
- **Coordinate space**: All drawing helpers receive pre-scaled context — use logical pixels, not device pixels

## Lift Analysis
- Compound lift detection via `LIFT_GROUPS` aliases + `BARBELL_COMPOUNDS` list
- Smart sorting: recent frequency (last 6 weeks) with 1.5x compound lift bias
- Lift search uses `_bindLiftSearch()` with `_bound` flag guard to prevent duplicate listeners

## Consistency Tracker
- ISO 8601 week tracking with 4-session/week target
- Heatmap with 5 intensity levels
- Streak counter based on consecutive weeks meeting target

## Calculators
- 1RM uses Epley formula
- DOTS calculator auto-saves body weight on `change` event, always normalizes to kg
