import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
// Execute the actual worker listener; no user cache or network is accessed.
const worker = (cached?: Response) => {
    const listeners: Array<(event: any) => void> = [];
    const fetch = vi.fn().mockResolvedValue(new Response('upstream'));
    runInNewContext(readFileSync('public/folia-cover-sw.js', 'utf8'), {
        URL, Response, fetch, caches: { open: async () => ({ match: async () => cached }) },
        self: { location: { origin: 'https://folia.test' }, addEventListener: (_event: string, handler: any) => listeners.push(handler) },
    });
    const request = async (target: string) => {
        let pending: Promise<Response> | undefined;
        for (const handler of listeners) handler({ request: { url: `https://folia.test/__folia_online_cover/?url=${encodeURIComponent(target)}`, method: 'GET' }, respondWith: (value: Promise<Response>) => { pending = value; } });
        return await pending;
    };
    return { fetch, request };
};
it('serves the saved image without needing the network', async () => {
    const cached = new Response('saved', { headers: { 'content-type': 'image/png' } });
    const runtime = worker(cached);
    expect(await (await runtime.request('https://images.test/cover.png'))?.text()).toBe('saved');
    expect(runtime.fetch).not.toHaveBeenCalled();
});
it('preserves ordinary img no-cors loading when the cache is empty', async () => {
    const runtime = worker();
    await runtime.request('https://images.test/cover.png');
    expect(runtime.fetch).toHaveBeenCalledWith('https://images.test/cover.png', expect.objectContaining({ mode: 'no-cors', credentials: 'omit' }));
});
