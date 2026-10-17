import { writeOpfsFile } from '../utils/writeOpfsFile';

// Imports Files-app selections into device-only OPFS for the existing directory scanner.
const IMPORTS_DIRECTORY = 'folia-file-imports';

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
