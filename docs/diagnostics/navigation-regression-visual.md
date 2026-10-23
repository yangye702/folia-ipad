# Visual and motion browser regression triage

This report owns **17 of the original 105 failures** in `phase1-web-evidence/browser-results.json`. Counts refer to original failed cases, not newly added regressions or passing controls. **All 17 have a passing latest observation**, mapped individually in `navigation-regression-visual-results.json`.

| Original group | Count | Cause and current evidence |
| --- | ---: | --- |
| `app.screenshot` | 3 | Obsolete August UI expectations, environment font differences, and a legacy media fixture that identifies desktop as touch. Local artwork review also exposed a real missing failure fallback, now fixed. Three desktop baselines updated precisely and **3/3** pass final verification. |
| `wallHandoff` | 3 | Two tests measured the whole variable-height corner container instead of the tools button. One real opaque-handoff visualizer mount defect. All three original cases pass after corrections, with the translucent-wall control passing. |
| `standInHandover` | 4 | **4/4 pass unchanged** in the exclusive run; all 19 cases in this file pass. Earlier CPU/HMR observations are not product regressions. |
| `gridEntrancePerf` | 2 | **2/2 pass unchanged** in the exclusive run. Stand-in cover/card geometry agrees; the held-main-thread capture has 5 qualifying samples and 90px travel. |
| `collectionOpenTransition` | 1 | **Passes unchanged** in the exclusive run, retaining >10 flight samples. Concurrent execution had produced only 7 samples. |
| `dioramaSettings` | 1 | Passed unchanged twice; the original 90s timeout is not reproduced. |
| `bravaisPerf` | 1 | **Passes unchanged** in the exclusive run: 5000-track mount block 57.2ms versus 65.8ms for 500 tracks, under the existing 400ms absolute/250ms relative limits. |
| `lattice` | 1 | **Passes unchanged** in the exclusive run; all 30 Lattice cases pass, including touch/secondary-pointer coasting. |
| `wallReflowMotion` | 1 | **Passes unchanged** in the exclusive run; both Bravais and Lattice spring/no-overshoot cases pass. |
| **Total** | **17** | No tests skipped, timeouts increased, numeric thresholds weakened, or render quality lowered. |

## Baselines and environment

The working starting commit is `21c90350`. The supplied phase-one comparison used **`65226b86`**, a different, older baseline. It already reproduces Netease's exact **2916px** difference, proving that screenshot failure predates the iPad commit. It does not by itself identify a font cause. The opaque-handoff regression was also replayed against the exact pure function extracted from `65226b86`: the new regression produced the same `true` instead of `false` failure as the pre-fix working tree.

Own browser runs use clean Vite on 4184, `/tmp/folia-visual-vite-cache`, one browser worker and separate output directories. HMR is disabled in the scratch server configuration. The initial 19-case run overlapped other one-worker browsers on a cgroup limited to four CPU cores. Its gallery was additionally reloaded by another agent's source edits: `Execution context was destroyed` and `window.mount()` missing are recorded environment-invalid observations. Subsequent runs restart the server after source/probe changes. Final motion/performance verification ran in a mutually exclusive window with no concurrent browser or unit-test job.

## Product fixes

### An opaque handoff briefly remounted the hidden visualizer

On return from Lattice, `wallLayer.ts` makes the visualizer available immediately. Before the returning library wall reports occlusion and the normal 300ms occlusion settle elapses, the ordinary mount rule mounted it behind a solid wall. This wastes rendering resources in Web and desktop hosts.

`playerVisualizerMount.ts` now lets an active handoff control backdrop lifetime: ordinary mounting waits until handoff ends, while `handoffKeepsVisualizer` still immediately mounts the backdrop wherever a translucent wall requires it. App supplies the existing handoff `active` value. This changes no animation duration, renderer, mode, background or quality setting.

RED: new pure regression failed (`true` versus `false`) both before the fix and against the extracted older-baseline function. GREEN: all 10 mount-rule unit cases; the existing solid-wall and translucent-wall browser cases. Related mount-rule and slider units subsequently pass **39/39**.

### Failed home artwork exposed the browser's broken image

Screenshot review found the local baseline update initially contained broken-image icons and alt text. Those pixels were **not accepted** as the final baseline. The local fixture intentionally supplies invalid `cover.jpg` bytes. `Grid3DSlider`'s `loadedIndices` only selects a viewport neighborhood; it does not say that decoding succeeded, and its `<img>` elements had no failure handler. A failed real cover therefore replaced the previous disc placeholder with a browser error glyph.

`Grid3DArtwork` now handles the discrete image error locally and renders the **existing Disc placeholder** in both card and full-bleed home layouts. Component identity follows source URL and size, so a changed source can load normally. Sizing, cover URLs, cache behavior, metadata, lazy loading, virtualization and valid-artwork rendering stay in the same path. No per-frame state or timing loop was added.

RED: the real Grid3DSlider probe failed in both layouts (`img` count 1 instead of 0). GREEN: **2/2** browser regressions cover failed artwork, changing to valid SVG artwork, successful decoding, and changing back to failed artwork. These are separate from screenshot baseline regeneration.

## Test contract and screenshot corrections

### Tools position sampling

The old tests sampled `.lattice-tools`, the entire corner container, although their contract is the *tools button* remaining the same node at the same position. Lattice adds a 40px locate button plus a 12px gap above it. `WallToolsButton.css` intentionally permits this (`.has-above`), moving the container's top exactly **52px** while its tools button remains anchored. Both unchanged assertions reproduced the 52px delta.

The sampler now targets the actual tools button inside the final direct child. Its label legitimately changes from Wall tools to Lattice tools. **Identity and both 0.5px position thresholds are retained**, as are the original handoff-phase assertions. Both corrected original cases pass. No phase assertion was removed to accommodate sparse RAF sampling.

### Three obsolete desktop screenshots

The snapshots were last authored at **`d35499a9` (August 17)**. Side-by-side review against current native screenshots identifies intentional later UI changes: Explore in the top navigation and provider marks on account pictures (`895471e8`, October 17), plus the newer home directory/type capsule and shared pill chrome (`2ef3a030` and the directory/tab refactor). Card/cover geometry remains consistent. The local snapshot additionally needed the failed-artwork product fix above.

Controlled font experiments are preserved in `navigation-regression-visual-font-evidence.json`. Removing the October CJK body fallback (`5fc8a900`) leaves 2877/3179/3752 different pixels, so that commit is **not the main explanation**. Overriding `.font-sans` only for diagnosis to Arial reduces differences to 1414/2270/3075; the remaining difference images contain the obsolete navigation, directory controls and account marks. CDP reports current native system text as Noto Sans and the Arial diagnostic as Liberation Sans. The historical font installation was not captured, so its exact configuration remains unknown. No diagnostic font override is included in production or final screenshots.

The broad legacy `matchMedia` fixture returned false for every non-light query, including desktop pointer/hover queries. That enables the four-second touch Ponder button and changes desktop affordances, creating capture-time differences. Only these three screenshot cases now use the existing `preserveNativeMediaQueries: true` option and an explicit light color scheme. They capture actual Chromium desktop media at the unchanged 1440×1100 viewport.

Exactly three baseline PNGs are regenerated and reviewed. The unchanged **600px** screenshot tolerance, existing font waits, disabled animations, CSS scaling and full-page capture remain in force. The local placeholder baseline is regenerated again after the artwork fix. No broken image or diagnostic CSS is accepted in the final baseline.

## Timing evidence and verification status

The initial targeted run was **7 passed / 12 failed across 19 selected cases**, including two passing-control selections; it is not a 1081-case rerun and its HMR/CPU-invalid observations are not acceptance evidence. The later non-performance selection was **8 passed / 1 failed**: all three regenerated screenshots, the three original wall-handoff cases, translucent-wall preservation and Diorama passed; collection flight sampling fell to 7 frames under concurrency.

During concurrent Bravais timing, both sizes mounted **62 tiles**, peak animated tiles stayed **35**, and offscreen animations stayed **0**. Mount blocks were 745ms/2777ms, far worse than the original 648ms failure, while the test limits remain 250ms relative and 400ms absolute. This establishes resource contention, not a safe production optimization target. The held-main-thread compositor test did record running opacity/scale/translate animations and changing screencast pixels, but only two qualifying samples against >2. The exclusive run recovers the original strict cases without changing their production motion paths or numeric assertions.

Final native desktop screenshot verification is **3/3 passed (39.2s)**, including the corrected local Disc placeholder. The final complete seven-file serial motion partition is **72/72 passed, 0 skipped, 0 flaky, exit 0**, in **675.68s**, starting `2026-10-23T04:58:02.906Z`. No claim of real iPad/Safari performance is made from desktop Chromium. All fourteen lyric modes, six backgrounds and Nomand cleanup are untouched by these fixes.


The exclusive partition covers these entire files, with no grep filter:

| File | Passed |
| --- | ---: |
| `test/ui/collectionOpenTransition.spec.ts` | 2 |
| `test/ui/wallHandoff.spec.ts` | 8 |
| `test/component/bravaisPerf.spec.ts` | 4 |
| `test/component/gridEntrancePerf.spec.ts` | 7 |
| `test/component/lattice.spec.ts` | 30 |
| `test/component/standInHandover.spec.ts` | 19 |
| `test/component/wallReflowMotion.spec.ts` | 2 |
| **Total** | **72** |

The final exclusive Bravais run mounts **77 tiles in both sizes**, peak flip animation is **35** tiles, and offscreen animation is **0**. The 250ms main-thread hold yields **5 qualifying screen samples / 90px movement**, exceeding the unchanged >2 / >20px checks. Earlier concurrent mount values and sparse screen sampling are therefore not used to justify changing production fidelity or test thresholds.

The original 17-case mapping combines the final motion run (13 original failures), final desktop screenshots (3) and retained passing Diorama case (1). The 72-case partition is intended to be combined with the parent's disjoint functional-file partition for whole-browser-suite accounting; it is not presented as a new full 1081-case run. The additional artwork regressions are 2/2 passed, and the related unit selection is 39/39 passed.
