# Web Navigation Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Restore browser/modal navigation consistency and classify all 105 recorded failures, fixing evidenced defects and obsolete fixtures.

**Architecture:** Extend existing navigation history with optional, ephemeral settings snapshots. Preserve the underlying view/search/collection snapshot. Settings pages share their existing store rather than maintaining a parallel router. Independently repair test contracts and investigate visual/environment failures.

**Tech Stack:** React, Zustand, History API, Vitest, Playwright.

**Spec:** User request “Web 功能收尾与导航回归修复”, baseline21c90350.

## Global Constraints

- Original branch, Draft PR3 and Preview only; no merge/Production/new origin.
- No online matching/provider/scoring/scheduling changes.
- No destructive storage operations; preserve queue/touch/visual/persistence work.
- No test deletion, skips, timeout inflation or weakened assertions.

## Review Focus

- Forward after close restores the visited settings page without losing the underlying collection.
- Repeated close/back must not trigger an extra traversal.
- Nested settings Back uses the same route as the touch return control.
- Base collection/search/player histories remain unchanged when settings are absent.
- Test changes must still verify account, lyrics, navigation and visual functionality.

### Task1: Modal history

- [x] Add touch UI RED reproduction for player→settings→Back, then Forward and nested settings.
- [x] Add optional settings snapshot to navigationHistoryJournal types; add bounded store/history bridge and store-owned ephemeral page state.
- [x] Connect SettingsModal existing controls to that page state, preserving direct-entry semantics and stored settings.
- [x] Verify browser and touch Back/close, repeated actions, nested pages and collection/player restoration.

### Task2: Existing105 failures

- [x] Read original JSON reports and group every failure exactly once.
- [x] Investigate independent account/library, obsolete-contract, visual-environment groups; record baseline evidence and targeted RED/GREEN results.
- [x] Fix only verified product defects or outdated fixtures/contracts; retain assertions of user-visible outcomes.
- [x] Re-run affected groups on fresh Vite instances; classify unresolved cases explicitly.

### Task3: Concentrated verification and delivery

- [x] Run typecheck, full unit suite, Production build and necessary concentrated browser regression once fixes stabilize. Residual native-scroll sampling risk is retained in the evidence, not described as fixed.
- [x] Review production changes and test coverage independently.
- [x] Prepare verified changes for the original branch; inspect PR/CI/Preview after push and record delivery status in the PR and final report. No merge or Production publish.
