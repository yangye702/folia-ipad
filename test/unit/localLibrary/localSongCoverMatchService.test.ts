import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeLocalSongCover } from '@/services/localSongCoverMatchService';
import { findAutomaticOnlineMetadataCandidate } from '@/services/onlineMetadataSearchService';
import { applyLocalSongMatchSelection } from '@/services/localSongMatchSelectionService';
import type { LocalSong } from '@/types';
vi.mock('@/services/coverCache', () => ({ getCachedCoverUrl: vi.fn().mockResolvedValue(null), cacheLocalSongOnlineCover: vi.fn().mockResolvedValue(false) }));
vi.mock('@/services/onlineMetadataSearchService', () => ({ findAutomaticOnlineMetadataCandidate: vi.fn() }));
vi.mock('@/services/localSongMatchSelectionService', () => ({ applyLocalSongMatchSelection: vi.fn() }));
const song = { id: 'cover', matchedLyrics: { lines: [] }, onlineMetadata: { coverUrl: 'https://example.test/dead.jpg' } } as unknown as LocalSong;
describe('independent cover completion', () => {
    beforeEach(() => vi.clearAllMocks());
    it('repairs a missing cache without changing existing lyrics or metadata', async () => {
        vi.mocked(findAutomaticOnlineMetadataCandidate).mockResolvedValue({ source: 'qq', coverUrl: 'https://example.test/good.jpg' } as any);
        vi.mocked(applyLocalSongMatchSelection).mockResolvedValueOnce({ coverCached: false } as any).mockResolvedValue({ coverCached: true } as any);
        expect(await completeLocalSongCover(song)).toBe(true);
        expect(applyLocalSongMatchSelection).toHaveBeenCalledWith(expect.objectContaining({ metadata: 'keep', lyrics: 'keep', cover: 'online' }));
    });
    it.each([{ noAutoMatch: true }, { markedPureMusic: true }, { localCoverAssetId: 'existing' }])('protects explicit choices %o', async patch => {
        expect(await completeLocalSongCover({ ...song, ...patch })).toBe(false);
        expect(findAutomaticOnlineMetadataCandidate).not.toHaveBeenCalled();
    });
});
