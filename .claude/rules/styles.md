---
paths:
  - "styles.css"
  - "index.html"
---

# Styles & Markup

## CSS Design System
- 40+ custom properties in `:root` — always add new tokens there, use `var(--token)` everywhere
- Dark theme only — no light mode
- iOS safe-area insets via `env(safe-area-inset-*)` with `viewport-fit=cover`

## Modal Pattern
- Bottom-sheet modals: `.modal-overlay` + `.modal` classes
- Activation: toggle `.active` class on overlay
- Slide-up/down animation via CSS transitions
- Reuse existing pattern for any new modals

## Layout Overrides
- Notes tab uses flex layout: `#tab-notes` ID selector overrides `.tab-content.active { display: block }`
- Tab bar uses safe-area tokens with capped bottom inset

## Accessibility
- All interactive elements require `aria-label` attributes
