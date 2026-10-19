import { beforeEach, describe, expect, it, vi } from 'vitest';
import { neteaseApi } from '@/services/onlineMusic/netease/netease';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
vi.mock('@/services/onlineMusic/netease/netease', () => ({ neteaseApi: { cloudSearch: vi.fn() } }));
// Search refusal and malformed envelopes must not become genuine empty results.
describe('matching provider failure boundaries', () => {
    beforeEach(() => vi.clearAllMocks());
    it('rejects NetEase refusal JSON', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({ code: 403 } as any);
        await expect(getOnlineMusicProvider('netease')!.search!.searchSongs('fixture', 10, 0)).rejects.toBeDefined();
    });
    it('rejects malformed NetEase song lists', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({ code: 200, result: {} } as any);
        await expect(getOnlineMusicProvider('netease')!.search!.searchSongs('fixture', 10, 0)).rejects.toBeDefined();
    });
    it('retains genuine NetEase empty arrays', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({ code: 200, result: { songs: [] } });
        expect((await getOnlineMusicProvider('netease')!.search!.searchSongs('fixture', 10, 0)).items).toEqual([]);
    });
});
