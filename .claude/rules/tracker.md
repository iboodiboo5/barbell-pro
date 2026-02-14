---
paths:
  - "tracker.js"
---

# Tracker Module

The tracker is the most complex module (~1,700 lines). Key subsystems:

## Parser (~400 lines)
- Handles tab-separated Google Sheet paste format
- Supports text-based loads (e.g., "bodyweight", "bar only"), not just numbers
- Header-row remarks are attached to the first exercise in a group
- Exercise boundary detection uses blank-line heuristics — test with real data after changes

## Swipe Gestures
- **Right swipe** = complete (elastic spring-back physics with resistance + overshoot)
- **Left swipe** = reveal delete (locks at 80px, auto-resets after 3s)
- Physics constants are in `setupSwipeHandlers()` — changing them affects feel significantly
- Completion toggle MUST use targeted DOM update (`classList.toggle` on specific card) — calling `renderExercises()` destroys active swipe state

## Long-Press Deletion
- 500ms threshold triggers delete mode for weeks/days
- 200ms visual hint (scale + opacity) gives tactile feedback
- One-time tooltip on first use (stored in `barbellPro_longPressHinted`)
- The "+" add-day tab is dynamically rendered — always guard with `.add-day-tab` class check
- Week delete: long-press → "Delete?" pill (3s) → modal confirm via `#deleteConfirmModal`
- Day delete: long-press → "Delete?" label (3s) → tap confirms immediately

## Undo
- 5-second toast with restore callback on delete operations
