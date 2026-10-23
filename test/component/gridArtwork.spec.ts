import { expect, test } from './fixtures';

// Decode failure is a browser event; exercise both actual home-card layouts and a later URL change.

for (const style of ['card', 'image'] as const) {
    test(`[${style}] failed artwork keeps its placeholder and a new URL can recover`, async ({ mount, page }) => {
        await page.addInitScript(value => localStorage.setItem('grid3d_card_style', value), style);
        const root = await mount('gridArtwork');
        const image = root.locator('[data-grid3d-slider] img');
        const disc = root.locator('[data-grid3d-slider] .lucide-disc');

        await expect(image).toHaveCount(0);
        await expect(disc).toBeVisible();

        await root.locator('[data-probe-action="valid"]').click();
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
        await expect(disc).toHaveCount(0);

        await root.locator('[data-probe-action="invalid"]').click();
        await expect(image).toHaveCount(0);
        await expect(disc).toBeVisible();
    });
}
