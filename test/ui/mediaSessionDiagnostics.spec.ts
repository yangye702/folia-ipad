import { expect, test } from '@playwright/test';
import { installBaseState, mockNeteaseApi } from './helpers/appFixtures';
import { waitForAppMounted } from '../helpers/appState';

// Synthetic callback delivery validates the touch evidence UI, not Safari lock-screen delivery.
test('opt-in diagnostics can mark a scene, inspect callbacks, select logs and turn off by touch', async ({ page }) => {
    await installBaseState(page, { neteaseMode: 'guest' });
    await mockNeteaseApi(page, 'guest');
    await page.addInitScript(() => {
        const handlers = new Map<string, (() => void) | null>();
        (window as any).__mediaDiagnosticHandlers = handlers;
        Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: {
            setActionHandler: (action: string, handler: (() => void) | null) => handlers.set(action, handler),
            setPositionState: () => {}, metadata: null, playbackState: 'none',
        } });
    });
    await page.goto('/?mediaSessionDebug=1');
    await waitForAppMounted(page);
    await page.getByRole('button', { name: 'Media diagnostics', exact: true }).click();
    const output = page.getByRole('textbox', { name: 'Media diagnostics' });
    await expect.poll(() => output.inputValue()).toContain('handler.registered');
    await page.getByRole('button', { name: 'Control Center', exact: true }).click();
    await page.evaluate(() => (window as any).__mediaDiagnosticHandlers.get('previoustrack')?.());
    await expect.poll(() => output.inputValue()).toContain('callback.received');
    await expect.poll(() => output.inputValue()).toContain('queue.blocked');
    await page.getByRole('button', { name: 'Lock Screen', exact: true }).click();
    await expect.poll(() => output.inputValue()).toContain('lock-screen');
    await page.getByRole('button', { name: 'Select logs', exact: true }).click();
    expect(await output.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Disable and clear diagnostics', exact: true }).click();
    await expect(output).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('folia-media-session-diagnostics-v1'))).toBeNull();
});
