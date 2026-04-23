# Changes Log

This file tracks frontend changes made from this point onward.

## Entry format
- Date
- Summary
- Files touched
- Why

---

## 2026-04-23
### Summary
- Simplified top-level frontend navigation into grouped views:
  - Run
  - Monitor
  - Governance
- Added compatibility navigation mapping so legacy page targets still route correctly.
- Added Monitor and Governance sub-tabs for clearer flow.

### Files touched
- client/src/App.jsx

### Why
- Reduce UI complexity and make the app easier to understand and maintain while preserving existing behavior.

## 2026-04-23 (follow-up)
### Summary
- Removed unused legacy frontend code path (`OverviewTab`) from the main app file.
- Updated dashboard guide copy to use the new grouped navigation language (Run, Monitor, Governance).
- Updated user-facing docs to match the simplified information architecture.

### Files touched
- client/src/App.jsx
- README.md
- USER_GUIDE.md

### Why
- Lower maintenance overhead, reduce confusion from outdated labels, and keep implementation/documentation aligned for easier scaling.

## 2026-04-24
### Summary
- Extracted Monitor and Governance tab containers from the app shell into dedicated page files.
- Rewired App routing render block to use these container modules while preserving all existing child views and behavior.
- Removed an unused UploadPage import from the app shell.

### Files touched
- client/src/App.jsx
- client/src/pages/MonitorPage.jsx
- client/src/pages/GovernancePage.jsx

### Why
- Keep the main app shell focused on orchestration, reduce cognitive load in one oversized file, and improve scalability without changing functionality.
