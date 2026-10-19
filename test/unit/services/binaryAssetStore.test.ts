import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCoverAsset } from '@/services/binaryAssetStore';

// test/unit/services/binaryAssetStore.test.ts
// Verifies malformed Electron file-cache payloads are removed instead of reaching object URL consumers.

describe('binaryAssetStore', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('restores an OPFS .bin image using its persisted MIME descriptor', async () => {
        const bytes = new Blob(['image bytes'], { type: 'application/octet-stream' });
        const removeEntry = vi.fn();
        const directory: any = { getDirectoryHandle: async () => directory, getFileHandle: async () => ({ getFile: async () => bytes }), removeEntry };
        vi.stubGlobal('window', {});
        vi.stubGlobal('navigator', { storage: { getDirectory: async () => directory } });
        const restored = await readCoverAsset('cover_local_synthetic', 'image/png');
        expect(restored?.type).toBe('image/png');
        expect(restored?.size).toBe(bytes.size);
        expect(removeEntry).not.toHaveBeenCalled();
    });

    it('deletes an Electron cover payload with an invalid MIME descriptor', async () => {
        const removeCoverCache = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('window', {
            electron: {
                getCoverCache: vi.fn().mockResolvedValue({
                    found: true,
                    data: new Uint8Array([1, 2, 3]),
                    mimeType: 'application/json',
                }),
                saveCoverCache: vi.fn(),
                removeCoverCache,
            },
        });

        await expect(readCoverAsset('cover_local_bad')).resolves.toBeNull();
        expect(removeCoverCache).toHaveBeenCalledWith('cover_local_bad');
    });
});
