import { test, expect } from './fixtures';

test.use({ hasTouch: true });

// Real browser history traversal, isolated from network/media; no synthetic popstate events.
test('Back consumes settings before player; Forward reopens and close preserves base history', async ({ page, mount }) => {
    await mount('settingsHistory');
    await page.getByRole('button', { name: 'Player', exact: true }).click();
    await expect(page.getByTestId('view')).toHaveText('player');
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('view')).toHaveText('player');
    await page.goForward();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.history.state?.view)).toBe('player');
    await page.goBack();
    await expect(page.getByTestId('view')).toHaveText('home');
});


test('nested touch return, Back/Forward and repeated Back restore settings pages in order', async ({ page, mount }) => {
    await mount('settingsHistory');
    await page.getByRole('button', { name: 'Player', exact: true }).tap();
    await page.getByRole('button', { name: 'Open settings', exact: true }).tap();
    await page.getByRole('button', { name: 'Lyrics page', exact: true }).tap();
    await page.getByRole('button', { name: 'Nested page', exact: true }).tap();
    await expect(page.getByTestId('settings-page')).toHaveText('lyrics/globalLyricOffset');
    await page.goBack();
    await expect(page.getByTestId('settings-page')).toHaveText('lyrics/root');
    await page.goForward();
    await expect(page.getByTestId('settings-page')).toHaveText('lyrics/globalLyricOffset');
    await page.getByRole('button', { name: 'Return to settings' }).tap();
    await expect(page.getByTestId('settings-page')).toHaveText('lyrics/root');
    await page.goBack();
    await expect(page.getByTestId('settings-page')).toHaveText('appearance/root');
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('view')).toHaveText('player');
    await page.goBack();
    await expect(page.getByTestId('view')).toHaveText('home');
});

test('closing settings over a collection preserves its search and original browser history', async ({ page, mount }) => {
    await mount('settingsHistory');
    await page.getByRole('button', { name: 'Search', exact: true }).tap();
    const search = await page.evaluate(() => window.history.state);
    await page.getByRole('button', { name: 'Collection', exact: true }).tap();
    const collection = await page.evaluate(() => window.history.state);
    await page.getByRole('button', { name: 'Open settings', exact: true }).tap();
    await page.getByRole('button', { name: 'Lyrics page', exact: true }).tap();
    await page.getByRole('button', { name: 'Close settings' }).tap();
    await expect.poll(() => page.evaluate(() => window.history.state)).toEqual(collection);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => window.history.state)).toEqual(search);
    await page.goForward();
    await expect.poll(() => page.evaluate(() => window.history.state)).toEqual(collection);
    await expect(page.getByRole('dialog')).toHaveCount(0);
});
