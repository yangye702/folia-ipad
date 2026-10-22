# Phase 1 navigation audit

Compared branch baseline `65226b866648148f46206a9f8170cfd1e12e42a8` with fixed upstream `ced47852c64c2709faebe0190d430c3ab75ca2a4`. Audit was read-only; subsequent implementation is limited to four confirmed small modal buttons. P0 online matching remains suspended/failed and untouched. No production origin, user music, OPFS, IndexedDB or saved settings were accessed or changed.

| Class | Evidence | Original/current code | Smallest action |
| --- | --- | --- | --- |
| A source capability present; device acceptance pending | Alternate touch command entrances exist: player-handle left slide, wall-tool left slide, configurable Grid action slide. Bravais has settings/search/queue/more tools. | Both refs: `src/components/panelTab/shell/PanelHandle.tsx:255`, `src/components/wall/WallToolsButton.tsx:243`, `src/components/shared/GridListSearchButton.tsx:64`, `src/library/suites/bravais/BravaisSeamHomeTools.tsx:196`. Baseline source diff was empty. | Preserve these entrances; do not claim command palette or settings is missing. |
| B touch bad | Isolated Chromium with `hasTouch:true`, 1180×820: palette help 33×33, palette close 32×32, settings header close 32×32; dedicated real Sheet probe confirmed its close is also 32×32. | Baseline/upstream: `CommandPalette.tsx:480–495`; `settings/kit/PageHeader.tsx:33–39`; `shared/Sheet.tsx:330–338`. | Implemented for these four buttons: increase to at least 44×44 on coarse pointer/hover-none; desktop sizes unchanged. |
| B broader touch source gap | Bravais home dock is 40×40; compact spine is 36×36. Source-proven sizing, no real-device usability verdict.  | Both refs: `src/library/suites/bravais/bravaisHome.css:296–304`. | Separate follow-up: consider narrow seam geometry and shared dialog layout. Outside this patch. |
| B browser UX / broader navigation contract | Actual Grid home → real “Back to Player” button → settings → native `page.goBack()`: base view became home/index0 while settings remained open. Settings opening did not add history. | Both refs: `src/stores/useSettingsModalStore.ts:85–105`; `src/hooks/useAppNavigation.ts:323–337`. Screenshot `/workspace/scratch/phase1-navigation-after-back.png`. | Define modal stack/history semantics before implementation. Do not add an ad hoc route blocker. Check close button, Forward, repeated Back, nested subviews and collection history together. |
| C missing/regression | No proven missing upstream navigation/modal implementation found. At the audited baseline, main inspected paths were byte-identical to fixed upstream; the four target-size fixes are new local changes. | Before this patch, empty `git diff ced47852… --` for palette, SettingsModal, Sheet, PageHeader, useAppNavigation, player handle, GridListSearchButton, Bravais home tools and StageModeRows. | Label shortcomings inherited UX gaps, not regressions. |
| D integration/configuration | Web stage mode exists. Now Playing uses `ws://localhost:9863`; PlayerCap defaults `localhost:8765` with HTTP/WS. On an iPad localhost is the iPad; settings cannot supply an absent external service. | `src/components/modal/settings/pages/integration/StageModeRows.tsx:185–214`, `src/services/nowPlayingProvider.ts:3–7`, `src/services/playerCapProvider.ts:6–22`. | Document external service/address/browser networking requirements. No service, scheme, credentials or deployment changes in this patch. |
| E desktop | Discord, desktop OBS server and lyric API are explicitly Electron-only. Desktop and Mods navigation are Electron-only. Web stage and OBS-link rows remain available separately. | `settings/pages/integration/options.ts:20–25`, `IntegrationPage.tsx:42`, `:76`, `:117`; `navigation/settingsNavModel.ts:76`, `:85`; `StageModeRows.tsx:214`. | Record desktop boundary; do not invent Web replacements. |
| A source persistence behavior; device acceptance pending | Import requests browser persistence best-effort; rejection retains normal quota/eviction rules. Docs already warn about clearing site data/PWA deletion and not assuming Safari/PWA/domain storage sharing. | `src/services/localFilesImport.ts:81–82`; `docs/ipad-local-music.md:9–13`. | Preserve fixed origin and storage implementations. Verify Safari and installed PWA independently without clearing data. |

## Browser evidence

Local audit used fresh disposable Chromium contexts on local port 4181, blocked Service Workers, and no real music. Server was stopped after audit. One preliminary run omitted the onboarding-version seed and was intercepted by onboarding; it was discarded and corrected.

Successful Browser Back probe output:

```json
{"beforeSettings":{"view":"player","appHistoryIndex":1},"openingSettingsHistoryChanged":false,"afterNativeBack":{"settingsOpen":true,"view":"home","history":{"view":"home","appHistoryIndex":0}}}
```

## Unverified real-device boundaries

- Palette uses `pt-[18vh]` and CSS-resolved `h-[min(496px,50vh)]`; settings use `90vh`/`86vh`. No proven keyboard/URL-bar clipping was observed. `test/ui/commandPaletteSizing.spec.ts` protects equal CSS-resolved surface dimensions.
- Main viewport lacks `viewport-fit=cover`; no main UI safe-area inset handling was found. Do not change viewport expansion without testing iPad Safari/PWA safe areas.
- Palette blur-on-touch is an explicit upstream iOS overflow-scroll workaround (`CommandPalette.tsx:431–437`, `:507`), not evidence of a missing focus feature. Preserve it.
- Need actual iPad software-keyboard, rotating viewport, Safari URL-bar and installed-PWA checks before selecting a dvh/safe-area change.

## Limited implementation verification

Focused component test: `test/component/ipadModalTargets.spec.ts`; standard parent fixture server on port 4173, one worker. Test mounts real palette, PageHeader and Sheet in a dedicated minimal probe. The old `playerLayout` probe was attempted first but failed before mounting with `permission-denied:stageLayers`; that setup failure was excluded from target evidence. Red/green results are recorded below.


- RED before production edits: three viewport tests failed specifically on palette help 33px and palette/settings close 32px; desktop original-size test passed. After adding the shared Sheet case, 820×1180 failed specifically on Sheet close 32×32 as well.
- GREEN final command: `npm run test:component -- test/component/ipadModalTargets.spec.ts --workers=1`: **4 passed (23.0s)**. Touch viewports: 820×1180, 1180×820 and 600×400. All four real buttons satisfy at least 44×44 and remain inside the viewport; left-edge taps open help and close all three frames. Fine-pointer desktop retains palette help 33×33 and all close buttons 32×32. These are Chromium automation results, not iPad hardware acceptance.
- An intermediate green run passed 4/4; a strengthened run then passed all three touch cases but lost the desktop palette during a dev-server navigation/HMR. The final fresh run after probe/source stabilization passed all four. No product workaround was added for test setup/HMR.
- `git diff --check` for this task's three production files and test/probe: passed. Parent coordinates typecheck and broader focused verification. No build/full suite, commit or deployment was run by this subtask.

Preserved red assertion record: `/workspace/scratch/phase1-modal-red-evidence.md`. Browser Back screenshot is copied into the same scratch directory.
