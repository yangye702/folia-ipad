import 'fake-indexeddb/auto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { appDatabase } from '@/services/appDatabase';
import { applyLocalSongMatchSelection } from '@/services/localSongMatchSelectionService';
import { getFromCache, saveToCache } from '@/services/db';
import type { LocalSong } from '@/types';
import type { OnlineMetadataCandidate } from '@/services/onlineMetadataSearchService';
// Actual nested Dexie transactions and descriptors; only network/OPFS bytes are isolated fixtures.
const hooks = vi.hoisted(() => ({ afterCommit: undefined as (() => void) | undefined }));
vi.mock('@/services/db', async importOriginal => {
    const actual = await importOriginal<typeof import('@/services/db')>();
    return { ...actual, saveToCache: async (...args: Parameters<typeof actual.saveToCache>) => {
        await actual.saveToCache(...args);
        if (args[2]?.throwOnError) hooks.afterCommit?.();
    } };
});
const files = vi.hoisted(() => new Map<string, Blob>());
vi.mock('@/services/binaryAssetStore', () => ({
    writeCoverAsset: async (key: string, blob: Blob) => { files.set(key, blob); return { backend: 'opfs', mimeType: blob.type, size: blob.size, updatedAt: 1 }; },
    removeCoverAsset: async (key: string) => { files.delete(key); },
    readCoverAsset: async (key: string) => files.get(key) || null,
    clearCoverAssets: vi.fn(), getCoverAssetUsage: vi.fn(),
}));
const old = { backend: 'opfs', mimeType: 'image/png', size: 3, updatedAt: 1, assetKey: 'old-art', sourceUrl: 'https://example.test/old.png' };
const song = { id: 'atomic', fileName: 'fixture.mp3', filePath: '', title: 'Confirmed', titleOrigin: 'manual-match', importedMetadata: { title: 'Confirmed', titleSource: 'embedded', artistNames: ['Artist'] }, addedAt: 1, duration: 200000, fileSize: 1, mimeType: 'audio/mpeg', useOnlineCover: true, onlineMetadata: { source: 'qq', songId: 'confirmed', title: 'Confirmed', artists: [{ name: 'Artist' }], coverUrl: old.sourceUrl, matchMode: 'manual', matchedAt: 1 } } as LocalSong;
const candidate = { source: 'netease', songId: 42, title: 'Candidate', artists: [{ name: 'Candidate' }], coverUrl: 'https://example.test/new.png' } as OnlineMetadataCandidate;
beforeEach(async () => {
    await appDatabase.delete(); await appDatabase.open();
    hooks.afterCommit = undefined;
    files.clear(); files.set('old-art', new Blob(['old'], { type: 'image/png' }));
    await appDatabase.local_music.put(song); await saveToCache('cover_local_atomic', old);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['new'], { type: 'image/png' }))));
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await appDatabase.delete(); });
it('rolls back both song and image pointer if cancelled during descriptor commit', async () => {
    const controller = new AbortController();
    hooks.afterCommit = () => controller.abort();
    await expect(applyLocalSongMatchSelection({ songId: song.id, candidate, metadata: 'keep', cover: 'online', lyrics: 'keep', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(await getFromCache('cover_local_atomic')).toEqual(old);
    expect((await appDatabase.local_music.get(song.id))?.onlineMetadata?.coverUrl).toBe(old.sourceUrl);
    expect([...files.keys()]).toEqual(['old-art']);
});
it('keeps the previous artwork when the local song save fails', async () => {
    vi.spyOn(appDatabase.local_music, 'put').mockRejectedValueOnce(new Error('controlled storage failure'));
    await expect(applyLocalSongMatchSelection({ songId: song.id, candidate, metadata: 'keep', cover: 'online', lyrics: 'keep' })).rejects.toMatchObject({ kind: 'storage', stage: 'local-save' });
    expect(await getFromCache('cover_local_atomic')).toEqual(old);
    expect([...files.keys()]).toEqual(['old-art']);
});
it('commits the cover pointer with the song before retiring old bytes', async () => {
    expect((await applyLocalSongMatchSelection({ songId: song.id, candidate, metadata: 'keep', cover: 'online', lyrics: 'keep' })).coverCached).toBe(true);
    expect((await appDatabase.local_music.get(song.id))?.onlineMetadata).toMatchObject({ songId: 'confirmed', title: 'Confirmed', coverUrl: candidate.coverUrl });
    expect((await getFromCache<any>('cover_local_atomic')).sourceUrl).toBe(candidate.coverUrl);
    expect(files.has('old-art')).toBe(false);
});

it.each(['noAutoMatch', 'markedPureMusic'])('discards staged artwork when the user sets %s during download', async flag => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
        await appDatabase.local_music.update(song.id, current => { if (flag === 'noAutoMatch') current.noAutoMatch = true; else current.markedPureMusic = true; });
        return new Response(new Blob(['new'], { type: 'image/png' }));
    }));
    await expect(applyLocalSongMatchSelection({ songId: song.id, candidate, metadata: 'keep', cover: 'online', lyrics: 'keep', matchMode: 'automatic' })).rejects.toMatchObject({ kind: 'protected' });
    expect(await getFromCache('cover_local_atomic')).toEqual(old);
    expect([...files.keys()]).toEqual(['old-art']);
});
it('discards staged artwork when the target song was deleted during download', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
        await appDatabase.local_music.delete(song.id);
        return new Response(new Blob(['new'], { type: 'image/png' }));
    }));
    await expect(applyLocalSongMatchSelection({ songId: song.id, candidate, metadata: 'keep', cover: 'online', lyrics: 'keep' })).rejects.toMatchObject({ kind: 'missing-song' });
    expect(await getFromCache('cover_local_atomic')).toEqual(old);
    expect([...files.keys()]).toEqual(['old-art']);
});
