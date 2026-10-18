import fs from 'node:fs';
import { expect, test } from './fixtures';

// Touch operation of the real registry controls and existing settings store.
test.use({ hasTouch: true });
test('mode shortcuts update existing tuning and fit a narrow touch panel', async ({ mount, page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await mount('ipadAppearanceControls');
    const panel = page.locator('[data-phase1-appearance]');
    const tuning = async () => JSON.parse(await page.locator('[data-phase1-tuning]').textContent() || '{}');
    await page.getByRole('button', { name: 'sonnet', exact: true }).tap();
    const before = (await tuning()).sonnet.postProcessEnabled;
    // The accessible labels come from the same existing translations as the settings panels.
    const post = panel.locator('button[aria-pressed]').filter({ has: page.locator('svg.lucide-sparkles') });
    await expect(post).toHaveCount(1);
    await post.tap();
    await expect.poll(async () => (await tuning()).sonnet.postProcessEnabled).toBe(!before);
    for (const mode of ['sonnet', 'pendolo', 'monet']) {
        await page.getByRole('button', { name: mode, exact: true }).tap();
        const bounds = await panel.boundingBox();
        const buttons = await panel.locator('button:visible').evaluateAll(nodes => nodes.map(node => {
            const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
        }));
        buttons.forEach(rect => { expect(rect.left).toBeGreaterThanOrEqual(bounds!.x - 1); expect(rect.right).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1); });
        const out = process.env.FOLIA_PHASE1_EVIDENCE || '/tmp/folia-phase1-evidence';
        fs.mkdirSync(out, { recursive: true });
        await panel.screenshot({ path: `${out}/after-${mode}-touch-panel.png` });
    }
});
