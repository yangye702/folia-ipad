# Account and library browser regression investigation

Scope: **55 of the 105 recorded failures** in `phase1-web-evidence/browser-results.json`: accountBehavior 35, libraryBehavior 13, artistBehavior 2, exploreSurface 1, collectionGrid 2, playingSongLocator 1, bravaisCollectionFilter 1. This is a case count, including parameterized cases, not a count of unique titles.

## Evidence and limits

The committed `baseline-comparison.json` records a separate run on **65226b866648148f46206a9f8170cfd1e12e42a8**, not the requested branch baseline 21c90350. It reproduces both representative account failures and the private-playlist assertion for all three renderers. It is corroborating evidence only. Source comparisons against **21c90350** show the relevant existing LoginScreen, fakeAuthProviders, GridView, onlineCollectionResource and Bravais collection CSS were unchanged before this work. Identical source establishes that these paths predate the iPad changes; it does not claim all 55 cases were executed on that baseline.

Runs use isolated port 4181, a separate Vite cache, one Playwright worker and blocked component service workers. HMR was disabled after another agent's probe edit reloaded the gallery during an intermediate run. Those interrupted intermediate runs are excluded from final pass counts. No full 105-case run was used to begin this investigation.

## Root causes and changes

- Shared login-window migration left the account tests targeting the removed inline grid menu and removed TUI login UI. The current window uses a platform listbox, provider-specific accessible title, shared method controls, named failure states and collapsed Details. Drivers now exercise the current entry points while retaining request, cancellation, account, activation and cleanup assertions.
- Account refresh moved into omni.readAccount. The probe's old refresh function was disconnected; fake auth.getLoginStatus now records the refresh and consumes scripted failures. The NetEase fake also exposes the real local-service adapter backed by the probe's injected status/restart store. These are fixture repairs, not a provider change.
- The account fake now emits the current QQ cancellation protocol (`expired` with `failure.retryAfterMs`), and its scripted NetEase outage uses the existing real failure classifier. Copy feedback is asserted in the shared window’s live status region. TUI method/retry/restart and the explicit keys-only flow use real Tab traversal with focused-control assertions before Enter. Production providers have no changes.
- Private-playlist copy is now the precise named error “This playlist is not public”; the test continues asserting that error and that an empty list has no error.
- A persistent Bravais stage can exist before the requested collection layer commits. Tests that read its layer immediately constructed `[data-bravais-list="null"]`. The helpers now wait for the stage to display the collection's actual layer, and for settling to finish.
- The reverse collection transition now uses its real cover carrier with `data-folia-collection-morph-direction="out"`; old observers watched the removed exit-backdrop element. These two tests also enable the existing covers fixture: a bare card has no picture to fly, so the current transition correctly does not produce a cover flight. Assertions still count the reverse transition and require it to end.
- **Product defect:** a failed reload retained a previously complete list but its locator called the retained list incomplete. Resource snapshots now carry completeness with the tracks. Reloads retain that fact until replacement tracks arrive; a changed collection revision invalidates it. Partial pages and failed initial reads remain incomplete. The locator still treats in-flight reads as pending.

- **Product defect:** the narrow Bravais scope action row wrapped its star onto another row. The scope row now stays on one line with flexible action widths; the original geometric assertion passes.
- The resize case now waits for the existing 280px breakpoint card width before checking scroll retention. Artist cases wait for their existing catalog/rendered surface readiness.
- Explore’s final arrow sequence clicked twice during a smooth scroll, changing the second relative target. One click per viewport retains the exact 1616px and 808px assertions and the remaining persistence checks.
- The Navidrome recovery case now leaves the failed collection, returns from the player to Home, and opens the same album again. Repeating `openRoot` on the still-open album intentionally preserves the same resource instance.
- The Bravais palette case keeps the seam input visible and checks its values before playback. After `--play` opens the player, it checks the same retained browse session’s query.

## Verification

- Initial focused branch reproduction: `/tmp/folia-account-library-red.json`: 9 cases, **6 failed / 3 passed**. Both account representative cases and three private-playlist cases failed; local-artist album opening passed in grid, TUI and Bravais; collectionGrid retained-list reload failed.
- Unit regression RED: two new resource cases failed because snapshots had no completeness information (`/tmp/folia-account-library-resource-red.log`).
- Resource suite GREEN: **22/22 passed**, including three new cases and the 19 existing resource cases (`/tmp/folia-account-library-resource-final-green.log`).
- A cache round-trip regression also reproduced RED: an unfinished upstream read had been written with hasMore:false. The final write now retains hasMore:true when the upstream never confirmed completion; the same cache schema is retained.
- Non-account first group: 27 passed / 10 failed (`/tmp/folia-account-library-other-step1.json`); the remaining ten then produced 5 passed / 5 failed (`/tmp/folia-account-library-other-step2.json`). These runs also include parameterized cases outside the original 55.
- Account representatives: 2 passed / 4 failed (`/tmp/folia-account-library-account-step3.log`); the two successful signed-in switching cases were retained as evidence and excluded from the later combined run.
- Combined run: **38 passed / 8 failed**, 46 current cases (`/tmp/folia-account-library-combined-final.json`). The eight failures were seven account fixture/assertion issues and the Navidrome recovery-flow issue described above.
- Final narrow run: **8 passed / 1 failed**, zero skipped (`/tmp/folia-account-library-last-nine.json`, `/tmp/folia-account-library-last-nine.log`). All seven account failures and the filter case with restored visible-input assertions passed. Navidrome's newly added Back-button click still lacked the real pointer reveal; the button intentionally has pointer-events disabled before that reveal.
- Final Navidrome rerun: **1/1 passed**, zero skipped (`/tmp/folia-account-library-nav-final.json`, `/tmp/folia-account-library-nav-final.log`). The test now moves through the top-left hot area, requires opacity 1, then clicks normally and retains all failed-read → successful-reopen locator assertions.
- Final result for this ownership scope: **all 55 original failures passed**. No production online-provider files changed; no tests were deleted, skipped or given longer timeouts.

The recorded final browser commands were (the isolated run configs were scratch files and have been removed; they inherited the normal configs, set one worker, disabled `webServer` and HMR, and overrode both app/gallery base URLs to port 4181):

```sh
ACCOUNT_LIBRARY_RESULTS_JSON=/tmp/folia-account-library-last-nine.json npx playwright test --config .account-library.playwright.config.ts test/component/accountBehavior.spec.ts test/ui/playingSongLocator.spec.ts test/ui/bravaisCollectionFilter.spec.ts -g 'a login canceled on the phone|no automatic check for a login canceled|a backend failure shows|\[tui\] .*a failed QQ sign-in offers|read failed says the list|the command palette filter still'
ACCOUNT_LIBRARY_RESULTS_JSON=/tmp/folia-account-library-nav-final.json npx playwright test --config .account-library.playwright.config.ts test/ui/playingSongLocator.spec.ts -g 'read failed says the list'
```

## Mutually exclusive original-failure classification

| Classification | Original failure count |
|---|---:|
| Account fixture and assertions predate shared LoginHost / omni account reads | 35 |
| Library named private-playlist error copy | 3 |
| Library Bravais stage commit / settling readiness (five null-layer, one focus, one layout-memory case) | 7 |
| Library reverse-transition fixture lacks opt-in covers and watches removed marker | 2 |
| Library product defect: scope action row wraps its star | 1 |
| Artist probe catalog / rendered surface readiness | 2 |
| Collection product defect: complete retained tracks treated as incomplete after failed reload | 1 |
| Collection resize assertion runs before breakpoint layout commits | 1 |
| Explore test sends redundant arrow clicks during an unfinished smooth scroll | 1 |
| Bravais filter test targets seam input while the seam is folded | 1 |
| Navidrome test repeats openRoot on the still-open page instead of leaving and reopening | 1 |
| **Total** | **55** |

These classifications separate product defects from stale tests and fixture readiness. Baseline attribution is limited to the exact source and representative runtime evidence described above.

## Recorded cases

Machine-readable mapping: `navigation-regression-account-library.json`. Original lines identify the committed 105-failure evidence, before test edits. **55 passed / 0 failed / 0 unresolved** in the completed targeted runs. Repeated titles are distinct parameterized cases. This is branch verification; baseline evidence has the limits described above.

The account spec has 43 current cases: 35 original failures and eight additional cases. Two signed-in-switch cases passed in the earlier representative run; the combined run included the other 41 account cases. Its final seven account failures were repeated in the nine-case verification. The other two final cases were Navidrome recovery and the already-passing Bravais palette case with its visible-input assertions restored. The narrow run passed all seven account cases and the filter case, but exposed the missing pointer reveal before clicking the player's Back control in Navidrome recovery. That final case passed separately after adding the real hot-area move and opacity assertion. The repeated filter case is counted once in the original 55.

| # | File:original line | Classification | Last completed status | Case |
|---|---|---|---|---|
| 1 | test/ui/bravaisCollectionFilter.spec.ts:84 | bravais_palette_query | passed | the command palette filter still acts on the same query, with --play |
| 2 | test/ui/playingSongLocator.spec.ts:205 | navidrome_reopen_flow | passed | "playing from" on a Navidrome album whose read failed says the list is not whole, until a read succeeds |
| 3 | test/component/accountBehavior.spec.ts:346 | account_contract | passed | [grid] switching to a signed-in provider asks first; cancel keeps it, confirm switches and cleans up once |
| 4 | test/component/accountBehavior.spec.ts:381 | account_contract | passed | [grid] a provider without accounts still asks before switching |
| 5 | test/component/accountBehavior.spec.ts:396 | account_contract | passed | [grid] the signed-out home picker follows the same rules as the switcher |
| 6 | test/component/accountBehavior.spec.ts:418 | account_contract | passed | [grid] signing in to another provider opens the login first, then asks to activate; declining keeps the account |
| 7 | test/component/accountBehavior.spec.ts:457 | account_contract | passed | [grid] accepting the activation switches and cleans up exactly once |
| 8 | test/component/accountBehavior.spec.ts:469 | account_contract | passed | [grid] signing in to the current provider needs no confirmation |
| 9 | test/component/accountBehavior.spec.ts:483 | account_contract | passed | [grid] a failed account refresh after confirmation reopens the login with the failure and diagnostics |
| 10 | test/component/accountBehavior.spec.ts:498 | account_contract | passed | [grid] several sign-in methods: no QR before a choice, one live session across choices |
| 11 | test/component/accountBehavior.spec.ts:546 | account_contract | passed | [grid] the TTL expires and cancels the code; an unscanned expiry is not a failure |
| 12 | test/component/accountBehavior.spec.ts:568 | account_contract | passed | [grid] expiring after a scan counts as a failure and offers diagnostics |
| 13 | test/component/accountBehavior.spec.ts:601 | account_contract | passed | [grid] a login canceled on the phone says so and holds the retry until the backend cooldown ends |
| 14 | test/component/accountBehavior.spec.ts:625 | account_contract | passed | [grid] a failed QQ sign-in offers retry and diagnostics like other providers |
| 15 | test/component/accountBehavior.spec.ts:663 | account_contract | passed | [grid] a failed sign-in runs the automatic check once and shows where the connection broke |
| 16 | test/component/accountBehavior.spec.ts:699 | account_contract | passed | [grid] no automatic check for a login canceled on the phone, and a check that fails says so |
| 17 | test/component/accountBehavior.spec.ts:723 | account_contract | passed | [grid] closing the login cancels the session and stops polling |
| 18 | test/component/accountBehavior.spec.ts:742 | account_contract | passed | [grid] a backend failure shows the cause and restart instead of retry; a successful restart asks for a code |
| 19 | test/component/accountBehavior.spec.ts:795 | account_contract | passed | [grid] only the current signed-in provider offers logout, and it runs that provider's injected logout |
| 20 | test/component/accountBehavior.spec.ts:346 | account_contract | passed | [tui] switching to a signed-in provider asks first; cancel keeps it, confirm switches and cleans up once |
| 21 | test/component/accountBehavior.spec.ts:418 | account_contract | passed | [tui] signing in to another provider opens the login first, then asks to activate; declining keeps the account |
| 22 | test/component/accountBehavior.spec.ts:457 | account_contract | passed | [tui] accepting the activation switches and cleans up exactly once |
| 23 | test/component/accountBehavior.spec.ts:483 | account_contract | passed | [tui] a failed account refresh after confirmation reopens the login with the failure and diagnostics |
| 24 | test/component/accountBehavior.spec.ts:498 | account_contract | passed | [tui] several sign-in methods: no QR before a choice, one live session across choices |
| 25 | test/component/accountBehavior.spec.ts:546 | account_contract | passed | [tui] the TTL expires and cancels the code; an unscanned expiry is not a failure |
| 26 | test/component/accountBehavior.spec.ts:568 | account_contract | passed | [tui] expiring after a scan counts as a failure and offers diagnostics |
| 27 | test/component/accountBehavior.spec.ts:601 | account_contract | passed | [tui] a login canceled on the phone says so and holds the retry until the backend cooldown ends |
| 28 | test/component/accountBehavior.spec.ts:625 | account_contract | passed | [tui] a failed QQ sign-in offers retry and diagnostics like other providers |
| 29 | test/component/accountBehavior.spec.ts:663 | account_contract | passed | [tui] a failed sign-in runs the automatic check once and shows where the connection broke |
| 30 | test/component/accountBehavior.spec.ts:699 | account_contract | passed | [tui] no automatic check for a login canceled on the phone, and a check that fails says so |
| 31 | test/component/accountBehavior.spec.ts:723 | account_contract | passed | [tui] closing the login cancels the session and stops polling |
| 32 | test/component/accountBehavior.spec.ts:742 | account_contract | passed | [tui] a backend failure shows the cause and restart instead of retry; a successful restart asks for a code |
| 33 | test/component/accountBehavior.spec.ts:822 | account_contract | passed | [grid-only] a new sign-in stops the previous session first, keyed to the provider that started it |
| 34 | test/component/accountBehavior.spec.ts:853 | account_contract | passed | [switch] with the TUI selected, its own account surface (not the grid fallback) answers a sign-in and a switch request |
| 35 | test/component/accountBehavior.spec.ts:889 | account_contract | passed | [switch] the QQ-style two-step sign-in works in the TUI with keys only |
| 36 | test/component/accountBehavior.spec.ts:906 | account_contract | passed | [switch] a sign-in started on the grid keeps its session in the TUI and completes there |
| 37 | test/component/accountBehavior.spec.ts:938 | account_contract | passed | [switch] a pending switch asked in one suite can be answered in the other |
| 38 | test/component/artistBehavior.spec.ts:491 | artist_fixture_readiness | passed | a local album opens the album entity with its songs |
| 39 | test/component/artistBehavior.spec.ts:510 | artist_fixture_readiness | passed | the filter lives in the browse session: an album opened and closed comes back filtered |
| 40 | test/component/collectionGrid.spec.ts:48 | collection_resize_readiness | passed | a collection stays where the listener scrolled to when further tracks arrive |
| 41 | test/component/collectionGrid.spec.ts:326 | collection_retained_complete | passed | a list that was read to its end is still whole after reading it anew has failed |
| 42 | test/component/exploreSurface.spec.ts:443 | explore_arrow_race | passed | explore tab opens with the songs last played in the app, newest first |
| 43 | test/component/libraryBehavior.spec.ts:264 | library_private_copy | passed | a private playlist says so instead of showing an empty grid; an empty one shows no error |
| 44 | test/component/libraryBehavior.spec.ts:264 | library_private_copy | passed | a private playlist says so instead of showing an empty grid; an empty one shows no error |
| 45 | test/component/libraryBehavior.spec.ts:264 | library_private_copy | passed | a private playlist says so instead of showing an empty grid; an empty one shows no error |
| 46 | test/component/libraryBehavior.spec.ts:362 | bravais_stage_readiness | passed | queueing the focused song routes online, local and Navidrome songs to their own enqueue path |
| 47 | test/component/libraryBehavior.spec.ts:528 | bravais_stage_readiness | passed | removing a song from a local playlist persists it and refreshes the library |
| 48 | test/component/libraryBehavior.spec.ts:606 | bravais_stage_readiness | passed | a background page arriving right after the removal does not bring the removed song back |
| 49 | test/component/libraryBehavior.spec.ts:638 | bravais_stage_readiness | passed | a slow removal with a background page landing meanwhile still ends without the removed song |
| 50 | test/component/libraryBehavior.spec.ts:1083 | bravais_stage_readiness | passed | an online track opens its provider album and artist, and going back restores the focus |
| 51 | test/component/libraryBehavior.spec.ts:1397 | library_reverse_fixture | passed | [grid] browser back from a nested album plays the reverse transition |
| 52 | test/component/libraryBehavior.spec.ts:1409 | library_reverse_fixture | passed | [grid] Escape from a nested album still plays it |
| 53 | test/component/libraryBehavior.spec.ts:2024 | bravais_scope_wrap | passed | the star sits at the end of the play / enqueue row instead of a row of its own |
| 54 | test/component/libraryBehavior.spec.ts:2066 | bravais_stage_readiness | passed | sorting from the list panel reorders the wall and stays on the infinite collage |
| 55 | test/component/libraryBehavior.spec.ts:2197 | bravais_stage_readiness | passed | entering the collection right below folds into one back: one reverse flip, no push, no origin left over |
