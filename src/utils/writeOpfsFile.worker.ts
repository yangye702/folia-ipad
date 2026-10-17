// Safari's OPFS synchronous writer runs only in a dedicated worker; keep memory bounded.
interface SyncFileAccess {
    truncate(size: number): void;
    write(data: ArrayBuffer, options: { at: number }): number;
    flush(): void;
    close(): void;
}
self.onmessage = async (event: MessageEvent<{ handle: FileSystemFileHandle; value: Blob }>) => {
    let access: SyncFileAccess | undefined;
    try {
        access = await (event.data.handle as FileSystemFileHandle & {
            createSyncAccessHandle(): Promise<SyncFileAccess>;
        }).createSyncAccessHandle();
        access.truncate(0);
        const value = event.data.value;
        for (let offset = 0; offset < value.size;) {
            const chunk = await value.slice(offset, offset + 1024 * 1024).arrayBuffer();
            const written = access.write(chunk, { at: offset });
            if (written <= 0) throw new Error('Unable to write local file');
            offset += written;
        }
        access.flush();
        access.close();
        access = undefined;
        self.postMessage({});
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error), name: error instanceof Error ? error.name : 'UnknownError' });
    } finally { access?.close(); }
};
