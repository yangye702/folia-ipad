import fs from 'node:fs';
import { expect, test } from './fixtures';

// Capture a regression at commit time, before passive effects can hide it.
test('Monet changes song in one commit and a reversed switch retains its decoded layer', async ({ mount, page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await mount('ipadPhase1Continuity');
    const baseline = process.env.FOLIA_PHASE1_CAPTURE === 'before';
    const out = process.env.FOLIA_PHASE1_EVIDENCE || '/tmp/folia-phase1-evidence';
    fs.mkdirSync(out, { recursive: true });
    const original = await page.locator('[data-phase1-layer="A"]').elementHandle();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/${baseline ? 'before' : 'after'}-monet-song-a.png` });
    await page.getByRole('button', { name: 'Change song', exact: true }).click();
    const host = page.locator('#phase1-continuity');
    await expect(host).toHaveAttribute('data-first-song-commit-reused', baseline ? 'true' : 'false');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/${baseline ? 'before' : 'after'}-monet-song-b.png` });
    await page.getByRole('button', { name: 'Switch and return', exact: true }).click();
    await page.waitForTimeout(180);
    await page.screenshot({ path: `${out}/${baseline ? 'before' : 'after'}-returning-layer.png` });
    const reused = await original!.evaluate(node => node.isConnected);
    expect(reused).toBe(!baseline);
    await expect(page.locator('[data-phase1-layer]')).toHaveCount(1);
    fs.writeFileSync(`${out}/${baseline ? 'before' : 'after'}-continuity.json`, JSON.stringify({ originalLayerReused: reused, firstSongCommitReused: await host.getAttribute('data-first-song-commit-reused') }, null, 2));
});

test('restoring an interrupted incoming layer finishes fully opaque and unblurred', async ({ mount, page }) => {
    await mount('ipadPhase1Continuity');
    await page.getByRole('button', { name: 'Interrupt entering layer', exact: true }).click();
    const target = page.locator('[data-phase1-layer="B"]');
    await expect(page.locator('[data-phase1-layer]')).toHaveCount(1);
    await expect(target).toHaveCSS('opacity', '1');
    await expect(target).toHaveCSS('filter', 'none');
    await expect(target).toHaveCSS('transform', 'none');
});
