import { expect, test, type Page } from '@playwright/test';
import { APP_VERSION, GUIDE_VERSION_STORAGE_KEY, waitForAppMounted } from '../helpers/appState';

// test/ui/helpCommunity.spec.ts
// The Help support rows expose a Discord invite and a read-only QQ number with CopyValue.
// Clipboard confirmation and refusal are announced through the row's live status; an absent API uses legacy copy.

const QQ_GROUP_NUMBER = '372521584';
const DISCORD_INVITE_URL = 'https://discord.com/invite/dMDBTHxeKd';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const openHelp = async (page: Page, { hideClipboardApi = false } = {}) => {
    await page.addInitScript(([version, guideKey, hide]) => {
        localStorage.clear();
        localStorage.setItem('library_suite_prompt_seen', 'true');
        localStorage.setItem('i18nextLng', 'en');
        localStorage.setItem('static_mode', 'true');
        localStorage.setItem(guideKey, version);
        // 记下 window.open 打开的地址，不真的开新页。
        const opened: string[] = [];
        (window as unknown as { __opened: string[] }).__opened = opened;
        window.open = ((url?: string | URL) => {
            opened.push(String(url));
            return null;
        }) as typeof window.open;
        if (hide) {
            Object.defineProperty(navigator.clipboard, 'writeText', { value: undefined, configurable: true });
        }
    }, [APP_VERSION, GUIDE_VERSION_STORAGE_KEY, hideClipboardApi] as const);
    await page.route('**/__mock_netease__/**', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    await waitForAppMounted(page);
    await page.evaluate(async () => {
        const storeModulePath = '/src/stores/useSettingsModalStore.ts';
        const { useSettingsModalStore } = await import(storeModulePath);
        useSettingsModalStore.getState().openSettings('help');
    });
};

const discord = (page: Page) => page.getByRole('button', { name: 'Join the Discord community', exact: true });
const qqRow = (page: Page) => page.locator('.st-row').filter({ has: page.getByText('QQ self-help group', { exact: true }) });
const copyQq = (page: Page) => qqRow(page).getByRole('button', { name: 'Copy', exact: true });
const readClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const openedUrls = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

test('community support exposes a Discord action and the QQ group number with its copy button', async ({ page }) => {
    await openHelp(page);
    await expect(discord(page)).toBeVisible();
    await expect(qqRow(page)).toContainText(QQ_GROUP_NUMBER);
    await expect(copyQq(page)).toBeVisible();
    await expect(page.getByRole('menu', { name: 'Join the community' })).toHaveCount(0);
});

test('the QQ copy button copies the group number and announces confirmation', async ({ page }) => {
    await openHelp(page);
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await copyQq(page).click();
    await expect(qqRow(page).getByRole('status')).toHaveText('Copied');
    expect(await readClipboard(page)).toBe(QQ_GROUP_NUMBER);
    await expect(qqRow(page).getByRole('status')).toHaveText('', { timeout: 4000 });
    await expect(qqRow(page)).toContainText(QQ_GROUP_NUMBER);
});

test('the Discord support action opens the invite and keeps Help available', async ({ page }) => {
    await openHelp(page);
    // Row delegates pointer activation from its visible label; the underlying button owns keyboard activation.
    await page.getByText('Join the Discord community', { exact: true }).click();
    expect(await openedUrls(page)).toEqual([DISCORD_INVITE_URL]);
    await discord(page).focus();
    await page.keyboard.press('Enter');
    expect(await openedUrls(page)).toEqual([DISCORD_INVITE_URL, DISCORD_INVITE_URL]);
    await expect(discord(page)).toBeVisible();
    await expect(copyQq(page)).toBeVisible();
});

test('copying leaves Help open and Escape closes the settings window', async ({ page }) => {
    await openHelp(page);
    await copyQq(page).click();
    await expect(qqRow(page).getByRole('status')).toHaveText('Copied');
    await expect(discord(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(discord(page)).toHaveCount(0);
    await expect(page.locator('[data-folia-keyboard-window]')).toHaveCount(0);
});

test('copying falls back to execCommand when the clipboard write API is unavailable', async ({ page }) => {
    await openHelp(page, { hideClipboardApi: true });
    await copyQq(page).click();
    await expect(qqRow(page).getByRole('status')).toHaveText('Copied');
    expect(await readClipboard(page)).toBe(QQ_GROUP_NUMBER);
});

test('a refused clipboard write announces failure and preserves the clipboard', async ({ page }) => {
    await openHelp(page);
    await page.evaluate(() => navigator.clipboard.writeText('unchanged clipboard'));
    await page.evaluate(() => {
        navigator.clipboard.writeText = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
    });
    await copyQq(page).click();
    await expect(qqRow(page).getByRole('status')).toHaveText('Copy failed, please try again');
    expect(await readClipboard(page)).toBe('unchanged clipboard');
    await expect(qqRow(page).getByRole('status')).toHaveText('', { timeout: 4000 });
    await expect(copyQq(page)).toBeEnabled();
});
