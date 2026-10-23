import { beforeEach, describe, expect, it, vi } from 'vitest';
import { neteaseApi } from '@/services/onlineMusic/netease/netease';
import { searchQQLyrics } from '@/services/onlineMusic/qq/qqLyricProvider';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import {
    findAutomaticOnlineMetadataCandidate,
    searchOnlineMetadata,
} from '@/services/onlineMetadataSearchService';

// test/unit/localLibrary/onlineMetadataSearchService.test.ts
// Verifies metadata-only provider selection and exact manual query forwarding.

vi.mock('@/services/onlineMusic/netease/netease', () => ({ neteaseApi: { cloudSearch: vi.fn() } }));
vi.mock('@/services/onlineMusic/qq/qqLyricProvider', () => ({ searchQQLyrics: vi.fn() }));

const song = {
    id: 'local-song',
    fileName: 'Target Song.flac',
    filePath: 'Library/Target Song.flac',
    title: 'Target Song',
    titleOrigin: 'import' as const,
    importedMetadata: { title: 'Target Song', titleSource: 'filename' as const, artistNames: ['Target Artist'], albumName: 'Target Album' },
    duration: 200000,
    fileSize: 1,
    mimeType: 'audio/flac',
    addedAt: 1,
};

describe('onlineMetadataSearchService', () => {
    beforeEach(() => vi.resetAllMocks());

    it('keeps a title-compatible NetEase candidate without querying QQ', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({ result: { songs: [
            { id: 1, name: 'Target Song', dt: 200000, ar: [{ id: 2, name: 'Target Artist' }], al: { id: 3, name: 'Target Album', picUrl: 'https://example.test/first.jpg' } },
        ] } });
        const candidate = await findAutomaticOnlineMetadataCandidate(song);
        expect(candidate?.source).toBe('netease');
        expect(candidate?.durationMatched).toBe(true);
        expect(searchQQLyrics).not.toHaveBeenCalled();
    });

    it('falls back to QQ when NetEase has no title-compatible candidate', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({ result: { songs: [
            { id: 1, name: 'Completely Unrelated Melody', dt: 200000, ar: [{ name: 'Someone Else' }] },
        ] } });
        vi.mocked(searchQQLyrics).mockResolvedValue([
            {
                id: 9,
                qqMid: 'qq-mid',
                name: 'Target Song',
                durationMs: 200000,
                artists: [{ id: 7, name: 'Target Artist' }],
                album: { id: 8, name: 'Target Album', coverUrl: 'https://example.test/qq-cover.jpg' },
            },
        ]);
        const candidate = await findAutomaticOnlineMetadataCandidate(song);
        expect(candidate).toMatchObject({
            source: 'qq',
            songId: 'qq-mid',
            titleMatched: true,
            coverUrl: 'https://example.test/qq-cover.jpg',
        });
    });

    it('falls back to provider-backed KuGou when NetEase and QQ have no title-compatible candidate', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({ result: { songs: [] } });
        vi.mocked(searchQQLyrics).mockResolvedValue([]);
        const kugouProvider = getOnlineMusicProvider('kugou')!;
        vi.spyOn(kugouProvider.search!, 'searchSongs').mockResolvedValue({
            items: [{
                id: 'HASH',
                kgHash: 'HASH',
                name: 'Target Song',
                durationMs: 200000,
                artists: [{ id: 7, name: 'Target Artist' }],
                album: { id: 8, name: 'Target Album', coverUrl: 'https://example.test/kugou-cover.jpg' },
                sourceRef: { kind: 'online', providerId: 'kugou', mediaId: 'HASH' },
            }],
            hasMore: false,
            nextOffset: 1,
        });

        const candidate = await findAutomaticOnlineMetadataCandidate(song);

        expect(candidate).toMatchObject({
            source: 'kugou',
            songId: 'HASH',
            titleMatched: true,
            coverUrl: 'https://example.test/kugou-cover.jpg',
        });
    });

    it('passes a manual query only to the selected source', async () => {
        vi.mocked(searchQQLyrics).mockResolvedValue([]);
        await searchOnlineMetadata('qq', 'custom user text', {
            title: 'Target Song', artist: '', durationMs: 0,
        });
        expect(searchQQLyrics).toHaveBeenCalledWith('custom user text', 1, 10, expect.any(AbortSignal));
        expect(neteaseApi.cloudSearch).not.toHaveBeenCalled();
    });

    it('stops waiting for a provider request when cancelled', async () => {
        let resolveRequest!: (value: { result: { songs: never[] } }) => void;
        vi.mocked(neteaseApi.cloudSearch).mockReturnValue(new Promise(resolve => {
            resolveRequest = resolve;
        }));
        const controller = new AbortController();
        const pending = searchOnlineMetadata('netease', 'Target Song', {
            title: 'Target Song', artist: '', durationMs: 0,
        }, { signal: controller.signal });
        await Promise.resolve();
        await Promise.resolve();
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        resolveRequest({ result: { songs: [] } });
    });
    it('rejects same-title wrong-artist candidates and continues to a reliable QQ candidate', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({ result: { songs: [
            { id: 1, name: 'Target Song', dt: 240000, ar: [{ name: 'Unrelated Singer' }], al: { name: 'Other Album' } },
        ] } });
        vi.mocked(searchQQLyrics).mockResolvedValue([
            { id: 9, name: 'Target Song', durationMs: 200000, artists: [{ id: 2, name: 'Target Artist' }], album: { id: 3, name: 'Target Album', coverUrl: 'https://example.test/cover.jpg' } },
        ]);
        expect((await findAutomaticOnlineMetadataCandidate(song))?.source).toBe('qq');
    });

    it('continues looking for a reliable cover when the first platform has none', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({ result: { songs: [
            { id: 1, name: 'Target Song', dt: 200000, ar: [{ name: 'Target Artist' }], al: { name: 'Target Album' } },
        ] } });
        vi.mocked(searchQQLyrics).mockResolvedValue([
            { id: 9, name: 'Target Song', durationMs: 200000, artists: [{ id: 2, name: 'Target Artist' }], album: { id: 3, name: 'Target Album', coverUrl: 'https://example.test/cover.jpg' } },
        ]);
        expect((await findAutomaticOnlineMetadataCandidate(song, undefined, { intent: 'cover' }))?.source).toBe('qq');
    });

});

describe('bounded provider waits', () => {
    it('reports timeout for a provider that never settles', async () => {
        vi.useFakeTimers();
        try {
            let settle!: (value: any) => void;
            vi.mocked(neteaseApi.cloudSearch).mockReturnValue(new Promise(resolve => { settle = resolve; }));
            const pending = searchOnlineMetadata('netease', 'timeout fixture', { title: 'Fixture', artist: '', durationMs: 0 });
            const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout', stage: 'search' });
            await vi.advanceTimersByTimeAsync(15401);
            await assertion;
            settle({ result: { songs: [] } });
            await Promise.resolve();
        } finally { vi.useRealTimers(); }
    });
});

it('recovers a successful but overconstrained metadata query without weakening candidate admission', async () => {
    const queries: string[] = [];
    vi.mocked(neteaseApi.cloudSearch).mockImplementation(async query => {
        queries.push(query);
        return { result: { songs: query === 'Target Song - Target Artist' ? [
            { id: 1, name: 'Target Song', dt: 200000, ar: [{ name: 'Target Artist' }], al: { name: 'Target Album', picUrl: 'https://example.test/cover.jpg' } },
        ] : [] } };
    });
    expect((await findAutomaticOnlineMetadataCandidate(song))?.source).toBe('netease');
    expect(queries).toEqual(['Target Song - Target Artist - Target Album', 'Target Song - Target Artist']);
});
