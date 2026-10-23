import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheLocalSongOnlineCover, getCachedCoverUrl, loadCachedOrFetchCover } from '@/services/coverCache';
import { getFromCache, removeFromCache, saveToCache } from '@/services/db';
import { readCoverAsset, removeCoverAsset, writeCoverAsset } from '@/services/binaryAssetStore';

vi.mock('@/services/db', () => ({
    getFromCache: vi.fn(),
    removeFromCache: vi.fn(),
    saveToCache: vi.fn()
}));
vi.mock('@/services/binaryAssetStore', () => ({
    clearCoverAssets: vi.fn(),
    getCoverAssetUsage: vi.fn(),
    readCoverAsset: vi.fn(),
    removeCoverAsset: vi.fn(),
    writeCoverAsset: vi.fn(),
}));

describe('coverCache', () => {
    const getFromCacheMock = vi.mocked(getFromCache);
    const saveToCacheMock = vi.mocked(saveToCache);
    const removeFromCacheMock = vi.mocked(removeFromCache);
    const readCoverAssetMock = vi.mocked(readCoverAsset);
    const removeCoverAssetMock = vi.mocked(removeCoverAsset);
    const writeCoverAssetMock = vi.mocked(writeCoverAsset);
    const originalFetch = globalThis.fetch;
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL');

    beforeEach(() => {
        getFromCacheMock.mockReset().mockResolvedValue(null);
        saveToCacheMock.mockReset();
        removeFromCacheMock.mockReset();
        readCoverAssetMock.mockReset().mockResolvedValue(null);
        removeCoverAssetMock.mockReset();
        writeCoverAssetMock.mockReset().mockResolvedValue(null);
        createObjectUrlSpy.mockReset();
        createObjectUrlSpy.mockReturnValue('blob:cached-cover');
        globalThis.fetch = vi.fn() as typeof fetch;
    });

    it('returns a blob URL when cover is already cached', async () => {
        const blob = new Blob(['cover']);
        getFromCacheMock.mockResolvedValueOnce(blob);

        await expect(getCachedCoverUrl('cover_1')).resolves.toBe('blob:cached-cover');
        expect(getFromCacheMock).toHaveBeenCalledWith('cover_1');
        expect(createObjectUrlSpy).toHaveBeenCalledWith(blob);
    });

    it('returns null when no cover URL is provided', async () => {
        await expect(loadCachedOrFetchCover('cover_1', null)).resolves.toBeNull();
        expect(getFromCacheMock).not.toHaveBeenCalled();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('reuses cached cover URLs without fetching', async () => {
        const blob = new Blob(['cached']);
        getFromCacheMock.mockResolvedValueOnce({ backend: 'opfs', mimeType: 'image/png', size: blob.size, updatedAt: 1, sourceUrl: 'https://img.test/cover.png' });
        readCoverAssetMock.mockResolvedValueOnce(blob);

        await expect(loadCachedOrFetchCover('cover_2', 'https://img.test/cover.png')).resolves.toBe('blob:cached-cover');
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(saveToCacheMock).not.toHaveBeenCalled();
    });

    it('fetches and saves cover blobs on cache miss', async () => {
        const blob = new Blob(['fresh'], { type: 'image/png' });
        const descriptor = { backend: 'opfs' as const, mimeType: 'image/png', size: blob.size, updatedAt: 1 };
        writeCoverAssetMock.mockResolvedValue(descriptor);
        getFromCacheMock.mockResolvedValueOnce(null);
        const fetchMock = vi.fn().mockResolvedValue({
            blob: vi.fn().mockResolvedValue(blob)
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(loadCachedOrFetchCover('cover_3', 'https://img.test/fresh.png')).resolves.toBe('blob:cached-cover');
        expect(fetchMock).toHaveBeenCalledWith('https://img.test/fresh.png', expect.objectContaining({ mode: 'cors', signal: expect.any(AbortSignal) }));
        expect(writeCoverAssetMock).toHaveBeenCalledWith(expect.stringMatching(/^cover_3_/), blob);
        expect(saveToCacheMock).toHaveBeenCalledWith('cover_3', expect.objectContaining({ ...descriptor, sourceUrl: expect.any(String), assetKey: expect.any(String) }), { throwOnError: true });
        expect(createObjectUrlSpy).toHaveBeenCalledWith(blob);
    });

    it('falls back to the original URL when caching fails', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        getFromCacheMock.mockRejectedValueOnce(new Error('cache failed'));

        await expect(loadCachedOrFetchCover('cover_4', 'https://img.test/fallback.png')).resolves.toBe('https://img.test/fallback.png');
        expect(warnSpy).not.toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    it('replaces the stable local-song cover cache', async () => {
        const blob = new Blob(['matched-cover'], { type: 'image/png' });
        const descriptor = { backend: 'opfs' as const, mimeType: 'image/png', size: blob.size, updatedAt: 1 };
        writeCoverAssetMock.mockResolvedValue(descriptor);
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(blob) }) as typeof fetch;
        await expect(cacheLocalSongOnlineCover('song-id', 'https://img.test/matched.png')).resolves.toBe(true);
        expect(removeFromCacheMock).not.toHaveBeenCalled();
        expect(removeCoverAssetMock).not.toHaveBeenCalled();
        expect(saveToCacheMock).toHaveBeenCalledWith('cover_local_song-id', expect.objectContaining({ ...descriptor, sourceUrl: expect.any(String), assetKey: expect.any(String) }), { throwOnError: true });
    });

    it('fetches QQ cover blobs through the same-origin proxy in web builds', async () => {
        const blob = new Blob(['qq-cover'], { type: 'image/jpeg' });
        const descriptor = { backend: 'opfs' as const, mimeType: 'image/jpeg', size: blob.size, updatedAt: 1 };
        writeCoverAssetMock.mockResolvedValue(descriptor);
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(blob) });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const coverUrl = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000album.jpg?max_age=2592000';

        await expect(cacheLocalSongOnlineCover('qq-song', coverUrl)).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            `/api/lyric-proxy?url=${encodeURIComponent(coverUrl)}`,
            expect.objectContaining({ mode: 'cors', signal: expect.any(AbortSignal) }),
        );
        expect(saveToCacheMock).toHaveBeenCalledWith('cover_local_qq-song', expect.objectContaining({ ...descriptor, sourceUrl: expect.any(String), assetKey: expect.any(String) }), { throwOnError: true });
    });

    it('fetches KuGou cover blobs through the same-origin proxy in web builds', async () => {
        const blob = new Blob(['kugou-cover'], { type: 'image/jpeg' });
        const descriptor = { backend: 'opfs' as const, mimeType: 'image/jpeg', size: blob.size, updatedAt: 1 };
        writeCoverAssetMock.mockResolvedValue(descriptor);
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(blob) });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const coverUrl = 'https://imge.kugou.com/stdmusic/400/cover.jpg';

        await expect(cacheLocalSongOnlineCover('kugou-song', coverUrl)).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            `/api/lyric-proxy?url=${encodeURIComponent(coverUrl)}`,
            expect.objectContaining({ mode: 'cors', signal: expect.any(AbortSignal) }),
        );
        expect(saveToCacheMock).toHaveBeenCalledWith('cover_local_kugou-song', expect.objectContaining({ ...descriptor, sourceUrl: expect.any(String), assetKey: expect.any(String) }), { throwOnError: true });
    });


    it('preserves the old cover when replacement download fails', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch;
        expect(await cacheLocalSongOnlineCover('protected', 'https://img.test/new.jpg')).toBe(false);
        expect(removeFromCacheMock).not.toHaveBeenCalled();
        expect(removeCoverAssetMock).not.toHaveBeenCalled();
        expect(writeCoverAssetMock).not.toHaveBeenCalled();
    });

    it('preserves the offline display of a legacy cover without URL metadata', async () => {
        const legacy = new Blob(['old artwork'], { type: 'image/png' });
        getFromCacheMock.mockResolvedValue(legacy);
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch;
        await expect(loadCachedOrFetchCover('legacy', 'https://img.test/old.png')).resolves.toBe('blob:cached-cover');
        expect(removeCoverAssetMock).not.toHaveBeenCalled();
    });

    it('does not reuse an old cover when the source URL changes', async () => {
        getFromCacheMock.mockResolvedValue({ backend: 'opfs', mimeType: 'image/png', size: 3, updatedAt: 1, sourceUrl: 'https://img.test/old.png' });
        readCoverAssetMock.mockResolvedValue(new Blob(['old'], { type: 'image/png' }));
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['new'], { type: 'image/png' }) }) as typeof fetch;
        await loadCachedOrFetchCover('cover_changed', 'https://img.test/new.png');
        expect(fetch).toHaveBeenCalled();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });
});

describe('cover replacement commit boundary', () => {
    it('keeps the previous pointer and bytes if saving the new descriptor fails', async () => {
        vi.mocked(getFromCache).mockResolvedValue({ backend: 'opfs', mimeType: 'image/png', size: 1, updatedAt: 1, assetKey: 'old-key', sourceUrl: 'https://img.test/old.png' });
        vi.mocked(writeCoverAsset).mockResolvedValue({ backend: 'opfs', mimeType: 'image/png', size: 2, updatedAt: 2 });
        vi.mocked(saveToCache).mockRejectedValueOnce(new Error('quota'));
        vi.mocked(removeCoverAsset).mockClear();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['new'], { type: 'image/png' }))));
        expect(await cacheLocalSongOnlineCover('commit', 'https://img.test/new.png')).toBe(false);
        expect(removeCoverAsset).not.toHaveBeenCalledWith('old-key');
    });
});
