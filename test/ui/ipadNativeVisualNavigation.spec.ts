import { expect, test } from '@playwright/test';
import { APP_VERSION, GUIDE_VERSION_STORAGE_KEY, waitForAppMounted } from '../helpers/appState';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) {
        console.log('native-touch-events', JSON.stringify(await page.evaluate(() => (window as any).__nativeTouchEvents)));
    }
});

// Natural touch entry and refresh in a disposable profile; no real music or online search.
for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    test.describe(`native visual entry ${viewport.width}`, () => {
        test.use({ hasTouch: true, viewport, serviceWorkers: 'block' });
        test('mode arrows, all built-in entries and selected settings survive refresh', async ({ page }, testInfo) => {
            test.setTimeout(180_000);
            await page.addInitScript(({ version, guideKey }) => {
                if (sessionStorage.getItem('phase1-visual-fixture')) return;
                sessionStorage.setItem('phase1-visual-fixture', 'ready');
                localStorage.setItem('i18nextLng', 'zh-CN');
                localStorage.setItem(guideKey, version);
                localStorage.setItem('library_suite_prompt_seen', 'true');
                localStorage.setItem('open_player_on_launch', 'true');
                localStorage.setItem('playback_entry_view', 'player');
                localStorage.setItem('playback_entry_view_chosen', 'true');
                localStorage.setItem('visualizer_mode', 'classic');
                localStorage.setItem('static_mode', 'true');
            }, { version: APP_VERSION, guideKey: GUIDE_VERSION_STORAGE_KEY });
            await page.route('**/__mock_netease__/**', route => route.fulfill({ json: {} }));
            await page.goto('/');
            await waitForAppMounted(page);
            await page.getByTestId('panel-toggle').getByRole('button').last().tap();
            await page.getByRole('button', { name: '控制', exact: true }).tap();
            const entries = await page.evaluate(async () => {
                const load = (name: string) => import(/* @vite-ignore */ name);
                const [lyrics, backgrounds, { default: i18n }] = await Promise.all([
                    load('/src/components/visualizer/registry.tsx'),
                    load('/src/components/visualizer/backgrounds/registry.tsx'),
                    load('/src/i18n/config.ts'),
                ]);
                return {
                    lyrics: lyrics.VISUALIZER_REGISTRY.map((entry: { mode: string }) => ({ value: entry.mode, label: lyrics.getVisualizerModeLabel(entry.mode, (key: string) => i18n.t(key)) })),
                    backgrounds: backgrounds.VISUALIZER_BACKGROUND_REGISTRY.map((entry: { mode: string }) => ({ value: entry.mode, label: backgrounds.getVisualizerBackgroundModeLabel(entry.mode, (key: string) => i18n.t(key)) })),
                } as { lyrics: Array<{ value: string; label: string }>; backgrounds: Array<{ value: string; label: string }> };
            });
            const state = () => page.evaluate(async () => {
                const name = '/src/stores/useVisualizerSettingsStore.ts';
                const { useVisualizerSettingsStore } = await import(/* @vite-ignore */ name);
                const current = useVisualizerSettingsStore.getState();
                return { mode: current.visualizerMode, background: current.visualizerBackgroundMode };
            });
            await page.evaluate(async () => {
                const events: unknown[] = [];
                (window as any).__nativeTouchEvents = events;
                const name = '/src/stores/useVisualizerSettingsStore.ts';
                const { useVisualizerSettingsStore } = await import(/* @vite-ignore */ name);
                useVisualizerSettingsStore.subscribe((state: any) => events.push({ type: 'state', mode: state.visualizerMode }));
                for (const type of ['pointerdown', 'pointerup', 'click']) {
                    document.addEventListener(type, event => {
                        const button = (event.target as Element).closest('button');
                        events.push({ type, label: button?.getAttribute('aria-label'), text: button?.textContent?.slice(0, 30), prevented: event.defaultPrevented });
                    }, true);
                }
            });
            const next = entries.lyrics[(entries.lyrics.findIndex(entry => entry.value === 'classic') + 1) % entries.lyrics.length].value;
            await page.getByRole('button', { name: '歌词样式 +', exact: true }).tap();
            await expect.poll(async () => (await state()).mode).toBe(next);
            await page.getByRole('button', { name: '歌词样式 −', exact: true }).tap();
            await expect.poll(async () => (await state()).mode).toBe('classic');
            await page.getByRole('button', { name: '歌词样式', exact: true }).tap();
            const lyrics = page.getByRole('radiogroup', { name: '歌词样式', exact: true });
            await expect(lyrics.getByRole('radio')).toHaveCount(14);
            await lyrics.getByRole('radio', { name: entries.lyrics.find(entry => entry.value === 'monet')!.label, exact: true }).tap();
            await expect.poll(async () => (await state()).mode).toBe('monet');
            await page.getByRole('button', { name: '背景类型', exact: true }).tap();
            const backgrounds = page.getByRole('radiogroup', { name: '背景类型', exact: true });
            await expect(backgrounds.getByRole('radio')).toHaveCount(6);
            await backgrounds.getByRole('radio', { name: entries.backgrounds.find(entry => entry.value === 'common')!.label, exact: true }).tap();
            await expect.poll(async () => (await state()).background).toBe('common');
            await page.screenshot({ path: testInfo.outputPath('native-panel.png') });
            await page.reload();
            await waitForAppMounted(page);
            await expect.poll(state).toEqual({ mode: 'monet', background: 'common' });
        });
    });
}
