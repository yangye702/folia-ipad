// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useLyricMatchSearch } from '@/components/modal/lyric-match/useLyricMatchSearch';

// Drive the real hook used by the source tab; only the external network response is controlled.
vi.mock('@/hooks/useLyricMatchSources', () => ({ useLyricMatchSources: () => ['lrclib', 'qq'] }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('switching to QQ starts its anonymous network request, and refusal is shown as an error', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const qqRequests: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        if (String(url).includes('/api/lyric-proxy')) {
            qqRequests.push({ url, method: init?.method, payload: JSON.parse(String(init?.body)) });
            return new Response(JSON.stringify({ code: 0, request: { code: 2001 } }));
        }
        return new Response('[]');
    }));
    const song = { id: 'diagnostic-fixture' };
    let search: ReturnType<typeof useLyricMatchSearch>;
    function Probe() {
        search = useLyricMatchSearch(song, { title: '幸福不远', artist: '郭书瑶', album: '', durationMs: 0 }, { initialSource: 'lrclib' });
        return React.createElement('button', { onClick: () => search.setSource('qq') }, 'QQ');
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
        await act(async () => root.render(React.createElement(Probe)));
        expect(qqRequests).toHaveLength(0);
        await act(async () => host.querySelector('button')!.click());
        expect(qqRequests).toHaveLength(1);
        expect(qqRequests[0].method).toBe('POST');
        expect(qqRequests[0].payload.request.param.query).toBe('幸福不远 - 郭书瑶');
        expect(search!.source).toBe('qq');
        expect(search!.results).toEqual([]);
        expect(search!.searchError).toBe(true);
        expect(search!.searchFailureMessageKey).toBe('qqLyricSearch.upstream');
        expect(search!.isSearching).toBe(false);
    } finally { await act(async () => root.unmount()); }
});
