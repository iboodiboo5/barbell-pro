# OK Barbell UI/UX Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a high-polish iOS-first UI/UX overhaul: softer tab sound, redesigned timer in Tracker with iOS-like wheel UX, chart point deep-link to workout with return path, rebuilt consistency system (baseline + start date), removal of recent history, full animation/accessibility sweep, bottom “chin” fix, and KK→OK rebrand.

**Architecture:** Keep the existing vanilla JS module pattern and wall-clock timer engine, but add lightweight cross-module interfaces between Analytics, Tracker, and App for deep-link navigation and view-state restoration. Rebuild consistency as a dedicated analytics subsystem with persisted settings and deterministic date inference fallback. Consolidate motion/safe-area behavior in CSS tokens to avoid one-off fixes.

**Tech Stack:** Vanilla JS, HTML/CSS, localStorage, Service Worker, Web Audio API.

---

## Phase 1

### Task 1: Rebrand to OK Barbell (UI + app metadata)

**Files:**
- Modify: `index.html`, `manifest.json`, `app.js`, `analytics.js`, `tracker.js`, `calculator.js`, `styles.css`

**Steps:**
1. Replace visible brand text (KK/KK Barbell) with OK/OK Barbell.
2. Update app title/meta/app name in HTML + manifest.
3. Update banner comments/headers for consistency only where needed.

**Verification:**
- Confirm brand appears as OK Barbell in title/logo/app install name.

### Task 2: Fix bottom “chin” and slim nav layout

**Files:**
- Modify: `styles.css`, `app.js`

**Steps:**
1. Introduce nav safe-area tokens (capped bottom inset) and slim tab bar sizing.
2. Center icon/text stack vertically and reduce dead vertical space.
3. Align RestTimer corner snap calculations with new tab-bar height constants.
4. Keep 4 tabs with labels.

**Verification:**
- iPhone viewport no oversized empty area below tab labels.

### Task 3: Make tab switch sound softer and satisfying

**Files:**
- Modify: `app.js`

**Steps:**
1. Replace Sound.tabClick() sharp tone with soft “glass tick”.
2. Keep duration short and volume lower.
3. Leave other sounds unchanged.

**Verification:**
- Tab switching feels softer and less sharp.

## Phase 2

### Task 4: Accessibility and overlooked-controls baseline pass
### Task 5: Relocate timer entry to Tracker Dock
### Task 6: Implement hybrid iOS-style wheel picker + quick chips
### Task 7: Clickable chart tooltip opens workout + contextual back chip
### Task 8: Remove Recent History section cleanly

## Phase 3

### Task 9: Rebuild consistency logic from ground up
### Task 10: Redesign consistency UI
### Task 11: Total animation passover
### Task 12: Broad overlooked UX pass
### Task 13: Cache version + final syntax verification
