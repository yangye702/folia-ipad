import fs from 'node:fs';
import { expect, test } from './fixtures';

// Touch editing must be reachable without first playing a row or synthesizing mouse hover.
for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    test.describe(`${viewport.width} touch queue`, () => {
        test.use({ hasTouch: true, viewport });
        test('both queue entries expose hit-testable actions without starting playback', async ({ mount, page }, testInfo) => {
            await mount('ipadQueueTouch');
            for (const entry of ['panel', 'palette']) {
                const host = page.locator(`[data-queue-probe="${entry}"]`);
                for (const [name, result] of [[/play next/i, 'next:0'], [/move to end/i, 'end:0'], [/remove/i, 'remove:0']] as const) {
                    const button = host.getByRole('button', { name }).first();
                    const box = await button.boundingBox();
                    expect(box?.width).toBeGreaterThanOrEqual(44);
                    expect(box?.height).toBeGreaterThanOrEqual(44);
                    expect(await button.evaluate(node => {
                        const rect = node.getBoundingClientRect();
                        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
                    })).toBe(true);
                    await button.tap();
                    await expect(page.locator('[data-queue-result]')).toHaveText(result);
                }
                const dir = process.env.FOLIA_PHASE1_WEB_EVIDENCE || testInfo.outputPath('evidence');
                fs.mkdirSync(dir, { recursive: true });
                await host.screenshot({ path: `${dir}/queue-${entry}-${viewport.width}.png` });
                expect(await host.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
            }
        });
    });
}

test('desktop queue actions retain compact hover behavior', async ({ mount, page }) => {
    await mount('ipadQueueTouch');
    for (const entry of ['panel', 'palette']) {
        const host = page.locator(`[data-queue-probe="${entry}"]`);
        const action = host.getByRole('button', { name: /play next/i }).first();
        expect(await action.evaluate(node => {
            const rect = node.getBoundingClientRect();
            return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        })).toBe(false);
        await host.hover({ position: { x: 20, y: entry === 'panel' ? 55 : 25 } });
        await expect(action).toBeVisible();
        await action.click();
        await expect(page.locator('[data-queue-result]')).toHaveText('next:0');
        expect((await action.boundingBox())?.width).toBeLessThan(44);
        await page.mouse.move(700, 500);
    }
});
