# P0 Batch Recovery Implementation Plan

**Goal:** Make existing online matching bounded, deduplicated and recoverable at library scale without weakening candidate admission or touching user storage formats.
**Architecture:** Keep current providers and matching commands. Add one memory-only matching search session with per-source serialization, pacing, result memoization and a bounded circuit cooldown. Reuse it for metadata, covers and lyric searches. A batch retains final item states and retries only transient unfinished work in two bounded recovery passes; fresh rows and existing transaction guards protect writes.
**Tech Stack:** TypeScript, Vitest, React, Dexie/OPFS, existing Vercel relay.
**Spec:** User's Phase 1 / P0 second-round request in this conversation.

## Constraints and review focus
- Same branch, Draft PR #3, Preview origin. No Production, new backend, migration, deletion, paid service, provider replacement or playback changes.
- Missing backend is configuration failure, QQ 2001 remains query-dependent upstream refusal, never inferred throttling.
- Pending deduplication must not let one cancelled caller cancel another; cancelled work must not populate stale cache or write music records.
- Queue wait is not network timeout. Non-abortable legacy calls must retain their source slot until settled.
- Failed image recovery must not overwrite successful metadata/artwork; retry starts from fresh song state.
- Diagnostics retain bounded scalar facts and aggregate batch counts, never credentials or raw responses.

## Tasks
1. Investigate transport/backend and deployment evidence; add failing source scheduler and proxy phase regression tests.
2. Implement `matchingSearchSession.ts`: one source slot, pacing, bounded wait, successful-query cache and in-flight sharing, unavailable-source suppression, cooldown/probe, retry classification. Route existing lyric and metadata matching through it without replacing provider implementations.
3. Add two batch recovery passes for only retryable unfinished songs; reload song before attempts, preserve final results, cancellation and success skipping. Expose bounded aggregate evidence through existing touch-copy diagnostic UI.
4. Repair evidenced query omissions after successful searches, preserving manual queries and admission checks. Label relay response origin and forwarding/read failures; teach existing platform boundaries to preserve these facts.
5. Run synthetic 50/100/250-song scenarios and compare actual baseline on the same controlled service scripts. Cover outages/recovery, missing artwork, low confidence, dedup, cancellation/resume. Report simulated request and success counts separately from live evidence.
6. Run targeted/full tests, typecheck, build and necessary Playwright regression; review diff and data guards, commit/push original branch, verify Draft/CI/Preview. Document optional NetEase backend choices without provisioning them.

Proceed autonomously as explicitly authorized by the user; no additional design approval gate.
