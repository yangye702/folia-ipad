import { afterEach, expect, it, vi } from 'vitest';
import { copyLocalFiles } from '../../../src/services/localFilesImport';

// Verify failed imports release their private copy and do not silently swallow quota failures.
afterEach(() => vi.unstubAllGlobals());
it('does not create a private directory for selections with no music', async () => {
    const getDirectory = vi.fn();
    vi.stubGlobal('navigator', { storage: { getDirectory } });
    expect(await copyLocalFiles([new File(['lyrics'], 'one.lrc')])).toBeNull();
    expect(getDirectory).not.toHaveBeenCalled();
});
it('removes an incomplete copy and reports the original quota error', async () => {
    const quota = new DOMException('Device storage is full', 'QuotaExceededError');
    const abort = vi.fn().mockResolvedValue(undefined);
    const directory = { getFileHandle: async () => ({ createWritable: async () => ({ write: async () => { throw quota; }, abort }) }) };
    const removeEntry = vi.fn().mockResolvedValue(undefined);
    const imports = { getDirectoryHandle: async () => directory, removeEntry };
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => imports }) } });
    await expect(copyLocalFiles([new File(['audio'], 'one.mp3')])).rejects.toBe(quota);
    expect(abort).toHaveBeenCalledOnce();
    expect(removeEntry).toHaveBeenCalledWith(expect.stringMatching(/^Files-/), { recursive: true });
});
