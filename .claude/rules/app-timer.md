---
paths:
  - "app.js"
---

# App Shell & RestTimer

## RestTimer Architecture
- **Wall-clock timing**: Uses `_endTime` (absolute `Date.now()` timestamp), NOT interval-based countdown — iOS suspends intervals in background tabs
- **Dual-loop rendering**: `requestAnimationFrame` primary + `setInterval` backup (catches rAF pauses)
- **Z-index layers**: Floating pill at z:150 (above tab bar), full-screen SVG ring overlay at z:250
- **Notification API fallback** when timer completes in background

## Timer UI
- **Draggable pill**: Touch-drag repositions, snaps to nearest corner quadrant, persists via `barbellPro_pillCorner`
- **Custom time input**: Tap digits to type (M:SS or plain seconds, 5s–5999s range), inline `<input>` with numeric keyboard
- **iOS Clock fallback**: `clock-timer://` deep link, shown only on iOS (UA + maxTouchPoints detection)
- **Swipe-down dismiss**: Swipe down on overlay collapses it (80px threshold)
- **Preset rendering**: `_renderPresets()` uses `_bound` flag guard for event listeners

## Sound & Haptics
- `Sound._play()` uses OscillatorNode + GainNode — always resume AudioContext before playing
- iOS AudioContext: persistent resume listeners on touchstart/touchend/click
- `Haptics._vibrate()` degrades silently on iOS (no error thrown)
- Never call `navigator.vibrate()` or Web Audio APIs directly — always use wrappers

## Storage Utility
- All keys prefixed `barbellPro_` — use `Storage.get()`/`Storage.set()` wrapper
- JSON serialization handled automatically by wrapper
