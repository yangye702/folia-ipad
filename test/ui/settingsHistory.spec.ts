import { expect, test, type Page } from '@playwright/test';
import { APP_VERSION, GUIDE_VERSION_STORAGE_KEY, waitForAppMounted } from '../helpers/appState';

// Settings history uses disposable browser storage and real touch entry; no user library or network.
test.use({ hasTouch: true, viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings', exact: true });
const currentView = (page: Page) => page.evaluate(() => window.history.state?.view);

test.beforeEach(async ({ page }) => {
    await page.addInitScript(([version, guideKey]) => {
        localStorage.setItem('i18nextLng', 'en');
        localStorage.setItem(guideKey, version);
        localStorage.setItem('library_suite_prompt_seen', 'true');
        localStorage.setItem('open_player_on_launch', 'false');
        localStorage.setItem('static_mode', 'true');
    }, [APP_VERSION, GUIDE_VERSION_STORAGE_KEY]);
    await page.route('**/__mock_netease__/**', route => route.fulfill({ json: {} }));
    await page.goto('/');
    await waitForAppMounted(page);
});

test('browser Back closes settings before leaving player; Forward restores settings', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Back to Player', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Player', exact: true }).tap();
    await expect.poll(() => currentView(page)).toBe('player');
    await page.getByTestId('panel-toggle').getByRole('button').last().tap();
    await page.getByRole('button', { name: 'Options', exact: true }).tap();
    await expect(dialog(page)).toBeVisible();
    await page.goBack();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => currentView(page)).toBe('player');
    await page.goForward();
    await expect(dialog(page)).toBeVisible();
    await expect.poll(() => currentView(page)).toBe('player');
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => currentView(page)).toBe('player');
    await page.goBack();
    await expect.poll(() => currentView(page)).toBe('home');
    await page.goForward();
    await expect.poll(() => currentView(page)).toBe('player');
    await expect(dialog(page)).toHaveCount(0);
});

test('nested settings Back/Forward and touch Cancel restore the parent before closing', async ({ page }, info) => {
    await page.getByRole('button', { name: 'Back to Player', exact: true }).tap();
    await page.getByTestId('panel-toggle').getByRole('button').last().tap();
    await page.getByRole('button', { name: 'Options', exact: true }).tap();
    await expect(dialog(page)).toBeVisible();
    const initialSection = await dialog(page).locator('nav button[aria-current="page"]').innerText();
    await dialog(page).getByRole('button', { name: 'Lyrics', exact: true }).tap();
    await expect(dialog(page).getByRole('button', { name: 'Lyrics', exact: true })).toHaveAttribute('aria-current', 'page');
    await dialog(page).locator('[data-settings-row="globalLyricTimelineOffset"]').tap();
    const nested = page.getByRole('dialog', { name: 'Global Timing Offset', exact: true });
    await expect(nested).toBeVisible();
    await page.goBack();
    await expect(nested).toHaveCount(0);
    await expect(dialog(page).getByRole('button', { name: 'Lyrics', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.goForward();
    await expect(nested).toBeVisible();
    await page.setViewportSize({ width: 820, height: 1180 });
    await nested.getByRole('button', { name: 'Cancel', exact: true }).tap();
    await expect(nested).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    await page.goBack();
    await expect(dialog(page).locator('nav button[aria-current="page"]')).toHaveText(initialSection);
    await page.screenshot({ path: info.outputPath('restored-settings.png') });
    await page.goBack();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => currentView(page)).toBe('player');
    await page.goBack();
    await expect.poll(() => currentView(page)).toBe('home');
});

test('a named settings anchor opens its target before history and Forward retains the later page', async ({ page }) => {
    await page.evaluate(async () => {
        const path = '/src/stores/useSettingsModalStore.ts';
        const { useSettingsModalStore } = await import(/* @vite-ignore */ path);
        useSettingsModalStore.getState().openSettings('help', 'general', null, 'playbackEntryView');
    });
    const playerRow = dialog(page).locator('[data-settings-row="playbackEntryViewChoice"]');
    await expect(playerRow.getByRole('button')).toHaveCount(3);
    await expect(playerRow).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Lyrics', exact: true }).tap();
    await expect(dialog(page).getByRole('button', { name: 'Lyrics', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(playerRow).toBeVisible();
    await page.goForward();
    await expect(dialog(page).getByRole('button', { name: 'Lyrics', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(playerRow).toHaveCount(0);
});
