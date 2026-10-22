# Red browser assertion record

The production target-size edits were not applied until these failures were observed.

Command: `npm run test:component -- test/component/ipadModalTargets.spec.ts --workers=1`

Result: 3 failed, 1 passed (25.9s). The three touch viewports were 820×1180, 1180×820 and 600×400. The desktop original-size case passed.

Repeated failures in each touch case:

```text
Error: palette-help
expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 44
Received:    33

Error: palette-close
expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 44
Received:    32

settings-close width and height
expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 44
Received:    32
```

After adding shared Sheet coverage, before any production edit:

Command: `npm run test:component -- test/component/ipadModalTargets.spec.ts --workers=1 --grep 820x1180`

Result: 1 failed, including all earlier failures and both actual Sheet-close dimensions:

```text
boxes['sheet-close'].width
expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 44
Received:    32

boxes['sheet-close'].height
expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 44
Received:    32
```

These target assertions ran against the real components in the dedicated ipadModalTargets probe. An earlier attempt to reuse playerLayout rendered blank due to permission-denied:stageLayers and was excluded from the sizing evidence. Final green command after all source/probe changes: same full focused command, 4 passed (23.0s).
