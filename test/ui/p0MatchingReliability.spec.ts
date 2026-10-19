import { expect, test } from '@playwright/test';
import { installBaseState, mockNeteaseApi } from './helpers/appFixtures';
import { waitForAppMounted } from '../helpers/appState';

// Independent browser contexts and synthetic records only; upstream replies are controlled fixtures.
test.use({ serviceWorkers: 'block' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');

test('cover-only completion persists across reload and preserves confirmed metadata and lyrics', async ({ page }) => {
    await installBaseState(page, { neteaseMode: 'guest' });
    await mockNeteaseApi(page, 'guest');
    await page.addInitScript(() => { delete (window as any).electron; });
    await page.route('**/__mock_netease__/**', async route => {
        if (!route.request().url().includes('cloudsearch')) return route.fallback();
        await route.fulfill({ json: { code: 200, result: { songs: [{ id: 42, name: 'Synthetic Song', dt: 200000, ar: [{ id: 7, name: 'Confirmed Artist' }], al: { id: 8, name: 'Confirmed Album', picUrl: 'https://y.gtimg.cn/fixture-cover.png' } }] } } });
    });
    await page.route('**/api/lyric-proxy?**', route => route.fulfill({ contentType: 'image/png', body: png }));
    await page.goto('/?matchDebug=1');
    await waitForAppMounted(page);
    const result = await page.evaluate(async () => {
        const load = (name: string) => import(/* @vite-ignore */ name);
        const { appDatabase } = await load('/src/services/appDatabase.ts');
        const { completeLocalSongCover } = await load('/src/services/localSongCoverMatchService.ts');
        const song = { id: 'p0-synthetic', fileName: 'synthetic.mp3', filePath: '', title: 'Synthetic Song', titleOrigin: 'manual-match', importedMetadata: { title: 'Synthetic Song', titleSource: 'embedded', artistNames: ['Confirmed Artist'], albumName: 'Confirmed Album' }, duration: 200000, fileSize: 1, mimeType: 'audio/mpeg', addedAt: 1,
            matchedLyrics: { lines: [{ fullText: 'Keep these lyrics', startTime: 0, endTime: 1 }] }, onlineMetadata: { source: 'qq', songId: 'confirmed-id', title: 'Synthetic Song', artists: [{ name: 'Confirmed Artist' }], album: { name: 'Confirmed Album' }, matchMode: 'manual', matchedAt: 1 } };
        await appDatabase.local_music.put(song);
        const completed = await completeLocalSongCover(song);
        const { getMatchingDiagnostics } = await load('/src/services/matchingDiagnostics.ts');
        return { completed, stored: await appDatabase.local_music.get(song.id), diagnostics: getMatchingDiagnostics() };
    });
    expect(result.completed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.stored.onlineMetadata).toMatchObject({ source: 'qq', songId: 'confirmed-id', artists: [{ name: 'Confirmed Artist' }] });
    expect(result.stored.matchedLyrics.lines[0].fullText).toBe('Keep these lyrics');
    await page.reload();
    await waitForAppMounted(page);
    const restored = await page.evaluate(async () => {
        const load = (name: string) => import(/* @vite-ignore */ name);
        const { appDatabase } = await load('/src/services/appDatabase.ts');
        const { getCachedCoverUrl } = await load('/src/services/coverCache.ts');
        const song = await appDatabase.local_music.get('p0-synthetic');
        const descriptor = (await appDatabase.media_cache.get('cover_local_p0-synthetic'))?.data;
        const url = await getCachedCoverUrl('cover_local_p0-synthetic', song.onlineMetadata.coverUrl);
        const response = url ? await fetch(url) : null;
        if (url) URL.revokeObjectURL(url);
        return { title: song.title, descriptor, restored: response?.ok, size: response ? (await response.blob()).size : 0 };
    });
    expect(restored, JSON.stringify(restored)).toMatchObject({ title: 'Synthetic Song', restored: true });
    expect(restored.size).toBeGreaterThan(0);
});

test('manual metadata failures remain visible and diagnostics support touch selection', async ({ page }) => {
    await installBaseState(page, { neteaseMode: 'guest' });
    await mockNeteaseApi(page, 'guest');
    await page.addInitScript(() => { delete (window as any).electron; });
    await page.route('**/__mock_netease__/**', async route => {
        if (!route.request().url().includes('cloudsearch')) return route.fallback();
        await route.fulfill({ status: 403, json: { code: 403 } });
    });
    await page.goto('/?matchDebug=1');
    await waitForAppMounted(page);
    await page.evaluate(async () => {
        const load = (name: string) => import(/* @vite-ignore */ name);
        const [{ default: React }, client, { LocalSongMetadataMatchDialog }] = await Promise.all([load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'), load('/src/components/modal/LocalSongMetadataMatchDialog.tsx')]);
        (client.createRoot ?? client.default.createRoot)(document.body.appendChild(document.createElement('div'))).render(React.createElement(LocalSongMetadataMatchDialog, { song: { id: 'synthetic-ui', title: 'Synthetic', titleOrigin: 'import', fileName: 'synthetic.mp3', importedMetadata: { artistNames: ['Fixture Artist'] } }, isDaylight: true, onClose() {}, onChanged: async () => {} }));
    });
    const dialog = page.getByRole('dialog').last();
    await dialog.locator('form button').click();
    await expect(dialog.getByRole('alert')).toContainText('http');
    await dialog.locator('summary').click();
    const diagnostics = dialog.getByRole('textbox', { name: 'Matching diagnostics' });
    await expect.poll(() => diagnostics.inputValue()).toContain('403');
    await diagnostics.focus();
    expect(await diagnostics.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBeGreaterThan(0);
});

test('turning online artwork off previews the same embedded source that is saved', async ({ page }) => {
    await installBaseState(page, { neteaseMode: 'guest' });
    await mockNeteaseApi(page, 'guest');
    await page.addInitScript(() => { delete (window as any).electron; });
    await page.route('**/__mock_netease__/**', async route => {
        if (!route.request().url().includes('cloudsearch')) return route.fallback();
        await route.fulfill({ json: { code: 200, result: { songs: [{ id: 42, name: 'Preview Fixture', dt: 200000, ar: [{ id: 1, name: 'Artist' }], al: { id: 2, name: 'Album', picUrl: 'https://y.gtimg.cn/preview.png' } }] } } });
    });
    await page.goto('/?matchDebug=1');
    await waitForAppMounted(page);
    await page.evaluate(async () => {
        const load = (name: string) => import(/* @vite-ignore */ name);
        const [{ default: React }, client, { LocalSongMetadataMatchDialog }, { appDatabase }] = await Promise.all([load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'), load('/src/components/modal/LocalSongMetadataMatchDialog.tsx'), load('/src/services/appDatabase.ts')]);
        const song = { id: 'preview-fixture', fileName: 'fixture.mp3', filePath: '', title: 'Preview Fixture', titleOrigin: 'import', duration: 200000, fileSize: 1, mimeType: 'audio/mpeg', addedAt: 1, importedMetadata: { title: 'Preview Fixture', titleSource: 'embedded', artistNames: ['Artist'], albumName: 'Album' }, localCoverAssetId: `sha256:${'a'.repeat(64)}`, useOnlineCover: true, onlineMetadata: { source: 'qq', songId: 'old', title: 'Preview Fixture', artists: [{ name: 'Artist' }], coverUrl: 'https://y.gtimg.cn/old.png', matchMode: 'manual', matchedAt: 1 } };
        await appDatabase.local_music.put(song);
        (client.createRoot ?? client.default.createRoot)(document.body.appendChild(document.createElement('div'))).render(React.createElement(LocalSongMetadataMatchDialog, { song, isDaylight: true, onClose() {}, onChanged: async () => {} }));
    });
    const dialog = page.getByRole('dialog').last();
    await dialog.locator('form button').click();
    await dialog.getByRole('button').filter({ hasText: 'Preview Fixture' }).click();
    const coverSwitch = dialog.getByRole('switch').last();
    await expect(coverSwitch).toHaveAttribute('aria-checked', 'true');
    await coverSwitch.click();
    await expect(dialog.locator('img').last()).toHaveAttribute('src', /\/__folia_cover\/sha256/);
    await dialog.getByRole('button', { name: 'Save selection', exact: true }).click();
    await expect.poll(() => page.evaluate(async () => {
        const path = '/src/services/appDatabase.ts';
        const { appDatabase } = await import(/* @vite-ignore */ path);
        return (await appDatabase.local_music.get('preview-fixture'))?.useOnlineCover;
    })).toBe(false);
});
