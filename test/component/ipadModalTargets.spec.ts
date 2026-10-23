import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';

// Real modal header hit areas must remain tappable on touch devices and compact viewports.
const readBox = (target: Locator) => target.evaluate(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
});

for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }, { width: 600, height: 400 }]) {
    test.describe(`touch modal targets ${viewport.width}x${viewport.height}`, () => {
        test.use({ viewport, hasTouch: true });
        test('palette help and modal close have 44px reachable hit areas', async ({ mount, page }, testInfo) => {
            await mount('ipadModalTargets');
            await page.getByRole('button', { name: 'Open palette', exact: true }).tap();
            const palette = page.getByTestId('command-palette-panel');
            const help = palette.getByRole('button', { name: 'Show all commands', exact: true });
            const close = palette.getByRole('button', { name: 'Close command palette', exact: true });
            await expect(palette.locator('..')).toHaveCSS('transform', 'none');
            const boxes: Record<string, Awaited<ReturnType<typeof readBox>>> = {};
            for (const [name, target] of [['palette-help', help], ['palette-close', close]] as const) {
                const box = await readBox(target);
                boxes[name] = box;
                expect.soft(box.width, name).toBeGreaterThanOrEqual(44);
                expect.soft(box.height, name).toBeGreaterThanOrEqual(44);
                expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
                expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
                expect(await target.evaluate(node => {
                    const box = node.getBoundingClientRect();
                    return node.contains(document.elementFromPoint(box.left + 2, box.top + box.height / 2));
                })).toBe(true);
            }
            await help.tap({ position: { x: 2, y: 22 } });
            await expect(palette.getByText('All commands', { exact: true })).toBeVisible();
            await close.tap({ position: { x: 2, y: 22 } });
            await expect(palette).toBeHidden();
            await page.getByRole('button', { name: 'Open settings header', exact: true }).tap();
            const settingsClose = page.getByRole('button', { name: 'Close', exact: true });
            await expect(settingsClose).toBeVisible();
            await expect(page.locator('.st-window')).toHaveCSS('transform', 'none');
            boxes['settings-close'] = await readBox(settingsClose);
            expect.soft(boxes['settings-close'].width).toBeGreaterThanOrEqual(44);
            expect.soft(boxes['settings-close'].height).toBeGreaterThanOrEqual(44);
            expect(boxes['settings-close'].x + boxes['settings-close'].width).toBeLessThanOrEqual(viewport.width);
            expect(boxes['settings-close'].y + boxes['settings-close'].height).toBeLessThanOrEqual(viewport.height);
            await settingsClose.tap({ position: { x: 2, y: 22 } });
            await expect(settingsClose).toBeHidden();
            await page.getByRole('button', { name: 'Open sheet', exact: true }).tap();
            const sheet = page.getByRole('dialog', { name: 'Test sheet' });
            await expect(sheet).toHaveCSS('transform', 'none');
            const sheetClose = sheet.getByRole('button', { name: 'Close', exact: true });
            boxes['sheet-close'] = await readBox(sheetClose);
            expect.soft(boxes['sheet-close'].width).toBeGreaterThanOrEqual(44);
            expect.soft(boxes['sheet-close'].height).toBeGreaterThanOrEqual(44);
            expect(boxes['sheet-close'].x + boxes['sheet-close'].width).toBeLessThanOrEqual(viewport.width);
            expect(boxes['sheet-close'].y + boxes['sheet-close'].height).toBeLessThanOrEqual(viewport.height);
            await sheetClose.tap({ position: { x: 2, y: 22 } });
            await expect(sheet).toBeHidden();
            await testInfo.attach('modal-hit-boxes', { body: JSON.stringify(boxes, null, 2), contentType: 'application/json' });
        });
    });
}

test('desktop modal controls keep their original sizes', async ({ mount, page }) => {
    await mount('ipadModalTargets');
    await page.getByRole('button', { name: 'Open palette', exact: true }).click();
    const palette = page.getByTestId('command-palette-panel');
    await expect(palette.locator('..')).toHaveCSS('transform', 'none');
    expect(await readBox(palette.getByRole('button', { name: 'Show all commands', exact: true }))).toMatchObject({ width: 33, height: 33 });
    const close = palette.getByRole('button', { name: 'Close command palette', exact: true });
    expect(await readBox(close)).toMatchObject({ width: 32, height: 32 });
    await close.click();
    await page.getByRole('button', { name: 'Open settings header', exact: true }).click();
    const settingsClose = page.getByRole('button', { name: 'Close', exact: true });
    expect(await readBox(settingsClose)).toMatchObject({ width: 32, height: 32 });
    await settingsClose.click();
    await page.getByRole('button', { name: 'Open sheet', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Test sheet' });
    await expect(sheet).toHaveCSS('transform', 'none');
    expect(await readBox(sheet.getByRole('button', { name: 'Close', exact: true }))).toMatchObject({ width: 32, height: 32 });
});
