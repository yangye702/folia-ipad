# Browser regression contract repair evidence

Scope: 32 of the 105 unexpected results in `phase1-web-evidence/browser-results.json`, across nine files. The starting checkout is `21c90350` on `feat/ipad-lyrics-visual-touch-v1`. No matching/provider/playback production behavior is changed by this work.

## Classification

| File stem | Initial failures | Classification | Evidence and repair |
| --- | ---: | --- | --- |
| `playerLayout.spec.ts` | 13 | Stale probe permission | Probe and installable demo still declared `ui.stage`; current `kinds.ts` requires `stageLayers`. Registration throws and React unmounts the probe, explaining every geometry/control failure. Use the current permission in both fixtures. A fresh run then exposed the demo’s retired `ctx.subscribe` call (`ctx.subscribe is not a function`); the documented public callback is now `ctx.onChange`, which carries the opted-in layout observation. Update the demo and README; native controls and all geometry assertions stay unchanged. |
| `helpCommunity.spec.ts` | 5 | Retired UI contract | `HelpPage` now renders a Discord action row and a QQ `CopyValue` row. Replace capsule/menu expectations with separate actions, actual clipboard value, live confirmation/reset, missing-API legacy copy, refused-API failure without clipboard mutation, and settings Escape behavior. Row pointer activation goes through its visible label, while its underlying accessible button owns keyboard activation; both paths are exercised. The shared clipboard unit contract explicitly rejects API refusal rather than falling back, so that product behavior is preserved. |
| `localPureMusicMark.spec.ts` | 4 | Retired source presentation | `SourceTab` renders source text/segments rather than title attributes. `LocalTab.availableSources` retains existing local lyric files even when the track is marked instrumental. Assert the available Local label and absence of a fictitious Instrumental source option; mark/unmark remains verified in the match dialog, playback store and IndexedDB, including unchanged audio URL and automatic-search suppression. |
| `bravaisSettingsGroup.spec.ts` | 3 | Moved category and controls | Settings anchors place `librarySuite` and `bravaisSettings` in Home. Current kit uses `data-settings-anchor`/`data-settings-row`, named groups and buttons with `aria-pressed`. Replace retired data selectors and General entry while retaining group order, window counts, persisted values, disabled states and live wall updates. |
| `commandPalette.spec.ts` | 2 | Invalid media fixture | Queue songs advertise 180 seconds while the supplied WAV is 60 seconds. `wholeSongCheck` correctly rejects cached media below half the advertised duration. Generate a WAV matching the song duration; preserve playback guards, exact selected-song assertions, keyboard changes and keep-open filtering checks. |
| `commandPaletteSizing.spec.ts` | 1 | Initial timeout not reproduced; harness setup hardened | The comparison creates two new pages rather than the configured page fixture. Pass the configured `baseURL` explicitly to both pages, retaining exact body/panel equality and content-state comparisons. All four sizing cases passed in the clean grouped run; the original failing case took 31.430 seconds under its unchanged 90-second test budget. This does not prove that an implicit URL caused the original timeout; no product defect is established. |
| `pixiVisualizerResize.spec.ts` | 1 | Moved import path | The deterministic Pixi regression imports removed `visualizer/loadPixi.ts`; the real loader lives under `visualizer/pixi/loadPixi.ts`. Correct the import and retain nested-filter resize/render/destroy behavior. |
| `bravaisChrome.spec.ts` | 2 | Relocated and conditional control | Locate moved from an unconditional quick menu cell to `GridLocateButton` above tools, shown only for a playing song and eligible page. Assert its absence without a song, explicitly seed playing state on a collection, and verify its accessible dedicated button alongside the complete five-item menu order and existing geometry/interaction checks. |
| `foliumSelectField.spec.ts` | 1 | Retired focus expectation | The select-only combobox deliberately prevents default on menu mousedown. Focus remains on the combobox and `aria-activedescendant` identifies the active option. Assert that focus, descendant and option highlight while holding the mouse, then verify release commits the value and closes the menu. |

## Baseline limits

The supplied `baseline-comparison.json` used a distinct earlier baseline, `65226b866648148f46206a9f8170cfd1e12e42a8`, archived with its own Vite cache on port 4182 and one worker. It explicitly reproduces one representative each for Bravais settings, queue song selection, Help, the moved Pixi import and player layout. This proves those representative failures predate the current branch; it is not a run of all 32 cases and does not establish the age of every other case. The initial 105-case report supplies the complete failure population; source inspection supplies the shared cause within each assigned group.

## Verification

A dedicated scratch Vite configuration uses `/tmp/folia-contracts-vite-cache`, port 4183, official build identity, initial Grid suite and mocked Netease base. Playwright uses one worker and Vite HMR is disabled for clean verification. Ports 4173, 4181 and 4184 are untouched. Scratch configurations and `/tmp` reports are not deliverables.

- Fresh RED: `foliumSelectField` mouse case, deterministic nested Pixi case and player layout full-chat case failed 3/3 before their changes. Error evidence: inactive option focus; failed dynamic import at removed path; `permission-denied:stageLayers` followed by unmounted probe.
- Related unit command: `npm run test:unit -- test/unit/mod-system/playerLayoutDemo.test.ts test/unit/mod-system/playerLayoutInstall.test.ts test/unit/mod-system/foliumSelectField.test.ts` — 3 files, 15 tests passed.
- Fresh HMR-disabled diagnostic: the local replay/suppressed matching/reload case passes. An earlier run while shared sources were changing produced a transient false mark state; that contaminated run is excluded from completion evidence.
- Full owned nine-file browser run, starting `2026-10-22T12:04:50.709Z`: **69 passed, 2 failed, 0 skipped, 0 flaky**, duration 995.757 seconds. All 13 player-layout cases passed after both demo-contract repairs. The two remaining failures were confined to Help: the pointer target was the deliberately underlaid keyboard button, and the refusal test demanded a fallback that `test/unit/system/clipboard.test.ts` explicitly forbids. No assertions or test deadlines were relaxed.
- Current clipboard unit verification: `npm run test:unit -- test/unit/system/clipboard.test.ts` — **4 passed**. In particular, `rejects when the clipboard API refused, without trying the copy command` passes.
- Final Help-only command: `npx playwright test -c .agent-contracts.playwright.config.ts test/ui/helpCommunity.spec.ts --reporter=line,json` — **6 passed, 0 failed, 0 skipped, 0 flaky**, starting `2026-10-22T23:06:09.309Z`, duration 157.336 seconds. It verifies Discord pointer and keyboard activation, native clipboard copy, live confirmation/reset, settings Escape, actual legacy copy when `writeText` is unavailable, and failed permission with unchanged clipboard plus reset/enabled state. Raw run: `/tmp/folia-contracts-help-final.jsonlog`.
- Combining the grouped run’s 66 passing non-Help cases with the final six-case Help file gives **72 distinct current cases with passing evidence**. This is evidence from two runs, not a claim of a single fresh 72-case full-group run. All 32 originally assigned failures have passing coverage. Of these, 31 needed stale contract/fixture repairs; the original sizing timeout remains unproven and was not reproduced under the unchanged timeout budget.
- Scoped `git diff --check` passed. No test was deleted or skipped; no timeout or geometry/state assertion was loosened. Shared clipboard production behavior, online matching, providers and playback guards were preserved.

The grouped file counts are: Bravais chrome 12, Folium select 5, Pixi resize 7, player layout 13, Bravais settings 3, command palette 17, command palette sizing 4, Help 5 and local instrumental marking 5. Help now has a sixth case to distinguish missing clipboard support from denied permission.

### Latest passing file evidence

| File | Passing cases | Run |
| --- | ---: | --- |
| `test/component/bravaisChrome.spec.ts` | 12 | Nine-file grouped run |
| `test/component/foliumSelectField.spec.ts` | 5 | Nine-file grouped run |
| `test/component/pixiVisualizerResize.spec.ts` | 7 | Nine-file grouped run |
| `test/component/playerLayout.spec.ts` | 13 | Nine-file grouped run |
| `test/ui/bravaisSettingsGroup.spec.ts` | 3 | Nine-file grouped run |
| `test/ui/commandPalette.spec.ts` | 17 | Nine-file grouped run |
| `test/ui/commandPaletteSizing.spec.ts` | 4 | Nine-file grouped run |
| `test/ui/localPureMusicMark.spec.ts` | 5 | Nine-file grouped run |
| `test/ui/helpCommunity.spec.ts` | 6 | Final Help-only rerun |
| **Distinct current cases** | **72** | **Combined evidence** |

## Original failing case ledger

### playerLayout

- `components` — full chat preserves the hidden back-button reveal region and native card clicks
- `components` — the private demo avoids a side panel and updates after viewport resizing
- `components` — moving the bottom baseline raises the native card and the chat clearance together
- `components` — publishes native status toasts and returns null immediately outside the player
- `components` — static visuals keep live app-overlay geometry and hidden control reveal regions
- `components` — a lower side panel leaves the non-overlapping upper-right dialog in place
- `components` — app.overlay content cannot reveal the native back button behind it
- `components` — shell capture receives a descendant mouse move even if it stops bubbling
- `components` — settings outside the shell does not reveal the back button without any mod
- `components` — command outside the shell does not reveal the back button without any mod
- `components` — publishes the complete 120px return hotspot independently of the button rem size
- `components` — reserves a full-width 56px titlebar only with custom window chrome
- `components` — disabling the appended layer restores native geometry and can re-enable cleanly

### helpCommunity

- `e2e` — one community capsule replaces the separate Discord and QQ buttons
- `e2e` — the QQ option copies the group number and says so
- `e2e` — the Discord option opens the invite and closes the menu
- `e2e` — Escape closes only the menu, and a click elsewhere closes it too
- `e2e` — copying falls back to execCommand when the clipboard API is refused

### localPureMusicMark

- `e2e` — the player lyric match window marks the playing song as instrumental in place and unmarks it again
- `e2e` — a marked song is not auto-matched when replayed, and the mark survives a reload
- `e2e` — the library match dialog toggles the mark and the playing song follows in place
- `e2e` — saving a provider result that is pure music in the player window marks the song too

### bravaisSettingsGroup

- `e2e` — the Bravais group holds the transparency, the windows per block and the stack edges
- `e2e` — the Bravais group stays out of the grid interface and appears once bravais is chosen
- `e2e` — the Bravais group switches the info strip material and the backdrop

### commandPalette

- `e2e` — queue song selection closes the palette by default
- `e2e` — queue keep-open preserves filtering for mouse and keyboard song changes

### commandPaletteSizing

- `e2e` — 固定命令行的有无不影响面板与 body 的尺寸

### pixiVisualizerResize

- `components` — nested Pixi filters render after a resize prunes their pass textures

### bravaisChrome

- `components` — the tools button opens its panel, the slide opens the command palette, Escape only closes the panel
- `components` — the tools panel groups one-shot actions on top, the volume below them and the wall appearance last

### foliumSelectField

- `components` — a mouse pick lands: pressing an option moves focus onto it without closing the menu first
