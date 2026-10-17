// Writes private files on Safari versions that expose only worker sync access handles.
export async function writeOpfsFile(handle: FileSystemFileHandle, value: Blob | string): Promise<void> {
    if (typeof handle.createWritable === 'function') {
        const writer = await handle.createWritable();
        try { await writer.write(value); await writer.close(); }
        catch (error) { await writer.abort().catch(() => undefined); throw error; }
        return;
    }
    const worker = new Worker(new URL('./writeOpfsFile.worker.ts', import.meta.url), { type: 'module' });
    try {
        await new Promise<void>((resolve, reject) => {
            worker.onmessage = (event: MessageEvent<{ error?: string; name?: string }>) => {
                if (event.data.error) reject(new DOMException(event.data.error, event.data.name || 'UnknownError'));
                else resolve();
            };
            worker.onerror = event => reject(new Error(event.message));
            worker.postMessage({ handle, value: typeof value === 'string' ? new Blob([value]) : value });
        });
    } finally { worker.terminate(); }
}
