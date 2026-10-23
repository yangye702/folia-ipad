import { afterEach, expect, it, vi } from 'vitest';
import { copyLocalFiles, getCopiedLocalFilesDirectory, readCopiedLocalAudio } from '../../../src/services/localFilesImport';

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

it('reopens a previously imported private audio folder without an IndexedDB handle', async () => {
    const privateDirectory = { name: 'Files-00000000-0000-4000-8000-000000000001' };
    const imports = { getDirectoryHandle: vi.fn().mockResolvedValue(privateDirectory) };
    const root = { getDirectoryHandle: vi.fn().mockResolvedValue(imports) };
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockResolvedValue(root) } });
    expect(await getCopiedLocalFilesDirectory(privateDirectory.name)).toBe(privateDirectory);
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('folia-file-imports');
    expect(imports.getDirectoryHandle).toHaveBeenCalledWith(privateDirectory.name);
});

it('does not probe arbitrary folders or create new folders when restoring', async () => {
    const getDirectory = vi.fn();
    vi.stubGlobal('navigator', { storage: { getDirectory } });
    expect(await getCopiedLocalFilesDirectory('Personal Music')).toBeNull();
    expect(getDirectory).not.toHaveBeenCalled();

    const root = { getDirectoryHandle: vi.fn().mockRejectedValue(new DOMException('Missing', 'NotFoundError')) };
    getDirectory.mockResolvedValue(root);
    expect(await getCopiedLocalFilesDirectory('Files-00000000-0000-4000-8000-000000000001')).toBeNull();
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('folia-file-imports');
    expect(root.getDirectoryHandle).not.toHaveBeenCalledWith('folia-file-imports', { create: true });
});

it('reads copied OPFS audio directly when no serialized directory handle exists', async () => {
    const rootName = 'Files-00000000-0000-4000-8000-000000000001';
    const file = new File(['local-audio'], 'song.m4a', { type: 'audio/mp4' });
    const songHandle = { getFile: vi.fn().mockResolvedValue(file) };
    const importedFolder = { getFileHandle: vi.fn().mockResolvedValue(songHandle) };
    const imports = { getDirectoryHandle: vi.fn().mockResolvedValue(importedFolder) };
    vi.stubGlobal('navigator', { storage: {
        getDirectory: vi.fn().mockResolvedValue({ getDirectoryHandle: vi.fn().mockResolvedValue(imports) }),
    } });
    const reopened = await readCopiedLocalAudio(rootName, `${rootName}/song.m4a`);
    expect(reopened?.size).toBe(file.size);
    expect(importedFolder.getFileHandle).toHaveBeenCalledWith('song.m4a');
});

it('never reads outside the private import root', async () => {
    const getDirectory = vi.fn();
    vi.stubGlobal('navigator', { storage: { getDirectory } });
    expect(await readCopiedLocalAudio('outside', '../secret.mp3')).toBeNull();
    expect(getDirectory).not.toHaveBeenCalled();
});
