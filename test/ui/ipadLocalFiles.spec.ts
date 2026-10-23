import { expect, test } from '@playwright/test';
import path from 'node:path';
import { waitForAppMounted } from '../helpers/appState';
import { installBaseState, mockNeteaseApi, openApp } from './helpers/appFixtures';

// Real MP3 bytes, OPFS and IndexedDB; only online services are mocked.
test('Files fallback imports two MP3s, retains them after reload and plays both with lyrics', async ({ page }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    await installBaseState(page, { neteaseMode: 'guest' });
    await page.addInitScript(() => {
        delete (window as any).electron;
        // Exercise older Safari's worker-only OPFS writer in a real browser.
        Object.defineProperty(FileSystemFileHandle.prototype, 'createWritable', { configurable: true, value: undefined });
        delete (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker;
        localStorage.setItem('playback_entry_view', 'player');
        localStorage.setItem('playback_entry_view_chosen', 'true');
        localStorage.setItem('local_lyrics_priority', 'local');
        (window as any).__appModule = (name: string) => import(/* @vite-ignore */ name);
    });
    await mockNeteaseApi(page, 'guest');
    await openApp(page);
    await page.getByRole('button', { name: 'Folder', exact: true }).last().click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import Folder', exact: true }).last().click();
    await (await chooser).setFiles(['one.mp3', 'two.mp3', 'one.lrc', 'two.lrc', 'cover.png'].map(name => path.resolve('test/fixtures/ipad-local', name)));
    const songs = () => page.evaluate(async () => (await (window as any).__appModule('/src/services/db.ts')).getLocalSongs());
    await expect.poll(async () => (await songs()).filter((song: any) => song.hasLocalLyrics && song.duration > 0 && song.localCoverAssetId).length).toBe(2);
    await page.reload();
    await waitForAppMounted(page);
    await page.getByRole('button', { name: 'Folder', exact: true }).last().click();
    await expect(page.getByText('All Songs').first()).toBeVisible();
    await page.getByRole('heading', { name: 'All Songs' }).first().click();
    const cards = page.locator('[data-library-renderer="grid"] [data-grid-card-play="play"]');
    await expect(cards).toHaveCount(2);

    // Reproduce Safari restoring IndexedDB songs but not its serialized
    // FileSystemDirectoryHandle. OPFS audio copies must still be playable.
    await page.evaluate(async () => {
        const db = await (window as any).__appModule('/src/services/db.ts');
        const { appDatabase } = await (window as any).__appModule('/src/services/appDatabase.ts');
        await db.removeFromCache('local_dir_handles');
        await appDatabase.local_music.toCollection().modify((song: any) => {
            delete song.fileHandle;
        });
    });
    await page.reload();
    await waitForAppMounted(page);
    await page.getByRole('button', { name: 'Folder', exact: true }).last().click();
    await page.getByRole('heading', { name: 'All Songs' }).first().click();
    const restoredCards = page.locator('[data-library-renderer="grid"] [data-grid-card-play="play"]');
    await expect(restoredCards).toHaveCount(2);
    await restoredCards.first().dispatchEvent('click');
    const snapshot = () => page.evaluate(async () => {
        const state = (await (window as any).__appModule('/src/stores/usePlaybackStore.ts')).usePlaybackStore.getState();
        return { title: state.currentSong?.name, lines: state.lyrics?.lines.map((line: any) => line.fullText), playing: [...document.querySelectorAll('audio')].some(audio => !audio.paused && audio.currentTime > 0.1) };
    });
    await expect.poll(async () => (await snapshot()).playing).toBe(true);
    const first = await snapshot();
    expect(first.lines?.join(' ')).toContain('local lyric');
    await expect(page.getByText(/First local lyric|Second local lyric|track keeps playing/).first()).toBeVisible();
    // The existing next-track shortcut exercises the application's queue/source switching.
    await page.keyboard.press('Control+ArrowRight');
    const nextTitle = first.title === 'iPad Track One' ? 'iPad Track Two' : 'iPad Track One';
    await expect.poll(async () => (await snapshot()).title).toBe(nextTitle);
    await expect.poll(async () => (await snapshot()).playing).toBe(true);
    expect((await snapshot()).lines?.join(' ')).toContain('local lyric');
    await expect(page.getByText(/First local lyric|Second local lyric|track keeps playing/).first()).toBeVisible();
});
