import { writeOpfsFile } from '../utils/writeOpfsFile';

// Imports Files-app selections into device-only OPFS for the existing directory scanner.
const IMPORTS_DIRECTORY = 'folia-file-imports';
const IMPORTED_ROOT_NAME = /^Files-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Safari can reopen our origin-private import folder directly, even if the
 * FileSystemDirectoryHandle persisted in IndexedDB was not restored.
 * Only resolve Folia-created UUID roots; never scan arbitrary device files.
 */
export async function getCopiedLocalFilesDirectory(rootFolderName: string): Promise<FileSystemDirectoryHandle | null> {
    if (!IMPORTED_ROOT_NAME.test(rootFolderName)) return null;
    if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') return null;
    try {
        const root = await navigator.storage.getDirectory();
        const imports = await root.getDirectoryHandle(IMPORTS_DIRECTORY);
        return await imports.getDirectoryHandle(rootFolderName);
    } catch (error) {
        console.warn('[LocalFiles] OPFS imported folder unavailable:', rootFolderName, error);
        return null;
    }
}

/**
 * Read an iPad Files import straight from its copied OPFS file, without
 * depending on a previously serialized FileSystemFileHandle in IndexedDB.
 * Reading (rather than a new import or scan) is safe on every playback.
 */
export async function readCopiedLocalAudio(rootFolderName: string, storedFilePath: string): Promise<File | null> {
    const root = await getCopiedLocalFilesDirectory(rootFolderName);
    if (!root) return null;
    const relativePath = storedFilePath.startsWith(`${rootFolderName}/`)
        ? storedFilePath.slice(rootFolderName.length + 1)
        : storedFilePath;
    const segments = relativePath.split('/').filter(Boolean);
    if (!segments.length || segments.some(x => x === '.' || x === '..')) return null;
    try {
        let directory = root;
        for (const segment of segments.slice(0, -1)) {
            directory = await directory.getDirectoryHandle(segment);
        }
        const handle = await directory.getFileHandle(segments[segments.length - 1]);
        const file = await handle.getFile();
        return file.size > 0 ? file : null;
    } catch (error) {
        console.warn('[LocalFiles] Could not reopen copied audio:', (error as Error)?.name ?? 'unknown');
        return null;
    }
}

export function pickLocalFiles(): Promise<File[]> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        // Do not filter to audio: users can select matching lyrics and folder artwork too.
        input.hidden = true;
        const finish = (files: File[]) => { input.remove(); resolve(files); };
        input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true });
        input.addEventListener('cancel', () => finish([]), { once: true });
        document.body.append(input);
        try { input.click(); } catch (error) { input.remove(); reject(error); }
    });
}

export async function copyLocalFiles(files: File[]): Promise<FileSystemDirectoryHandle | null> {
    if (!files.some(file => /\.(mp3|flac|m4a|wav|ogg|opus|aac)$/i.test(file.name))) return null;
    const root = await navigator.storage.getDirectory();
    const imports = await root.getDirectoryHandle(IMPORTS_DIRECTORY, { create: true });
    const name = `Files-${crypto.randomUUID()}`;
    const directory = await imports.getDirectoryHandle(name, { create: true });
    try {
        const names = new Set<string>();
        for (const file of files.filter(file => /\.(mp3|flac|m4a|wav|ogg|opus|aac|lrc|vtt|ttml|qrc|yrc|krc|png|jpe?g)$/i.test(file.name))) {
            if (names.has(file.name)) throw new Error(`Duplicate selected file name: ${file.name}`);
            names.add(file.name);
            const handle = await directory.getFileHandle(file.name, { create: true });
            await writeOpfsFile(handle, file);
        }
        // A browser may decline persistence; normal quota/eviction rules still apply.
        await navigator.storage.persist?.().catch(() => false);
        return directory;
    } catch (error) {
        await imports.removeEntry(name, { recursive: true });
        throw error;
    }
}

export async function removeLocalFilesCopy(handle: FileSystemDirectoryHandle): Promise<void> {
    if (!handle.name.startsWith('Files-')) return;
    const root = await navigator.storage.getDirectory();
    let imports: FileSystemDirectoryHandle;
    try { imports = await root.getDirectoryHandle(IMPORTS_DIRECTORY); }
    catch (error) {
        if ((error as DOMException).name === 'NotFoundError') return;
        throw error;
    }
    const relative = await imports.resolve(handle);
    // Never remove an external directory or anything outside our own direct children.
    if (relative?.length === 1) await imports.removeEntry(relative[0], { recursive: true });
}
