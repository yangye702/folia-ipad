import { afterEach, expect, it, vi } from 'vitest';
import { searchQQLyrics } from '@/services/onlineMusic/qq/qqLyricProvider';
import { getQqSearchDiagnostics } from '@/services/onlineMusic/qq/qqLyricSearchStatus';

// Exercise the real anonymous search boundary with the iPad-observed response sequence.
afterEach(() => vi.unstubAllGlobals());
const answer = (code = 0, songs: unknown[] = []) => new Response(JSON.stringify({ code: 0, request: { code, data: { body: { item_song: songs } } } }));
const song = { id: 42, mid: 'fixture-mid', title: '幸福不远', singer: [{ name: '郭书瑶' }], album: { name: 'Honey' } };
function serve(reply: (query: string) => Response | Promise<Response>) {
    const queries: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
        const query = JSON.parse(init.body).request.param.query;
        queries.push(query);
        return reply(query);
    }));
    return queries;
}
it('recovers the default title-artist search through traditional title and records actual attempts', async () => {
    vi.stubGlobal('window', { location: { search: '?qqLyricDebug=1' } });
    const queries = serve(query => query === '幸福不遠' ? answer(0, [song]) : answer(2001));
    expect(await searchQQLyrics('幸福不远 - 郭书瑶')).toMatchObject([{ id: 42, artists: [{ name: '郭书瑶' }] }]);
    expect(queries).toEqual(['幸福不远 - 郭书瑶', '幸福不遠 - 郭書瑤', '幸福不远', '幸福不遠']);
    expect(getQqSearchDiagnostics().slice(-4).map(row => [row.query, row.outcome])).toEqual(queries.map((query, index) => [query, index === 3 ? 'success' : 'upstream']));
});
it('keeps original successful results without additional requests', async () => {
    const queries = serve(() => answer(0, [song]));
    expect(await searchQQLyrics('幸福不远')).toHaveLength(1);
    expect(queries).toEqual(['幸福不远']);
});
it('tries the reverse script after a valid empty response', async () => {
    const queries = serve(query => answer(0, query === '幸福不远' ? [song] : []));
    expect(await searchQQLyrics('幸福不遠')).toHaveLength(1);
    expect(queries).toEqual(['幸福不遠', '幸福不远']);
});
it('returns zero only when every attempted variant is a valid zero', async () => {
    const queries = serve(() => answer());
    expect(await searchQQLyrics('幸福不远')).toEqual([]);
    expect(queries).toEqual(['幸福不远', '幸福不遠']);
});
it('preserves upstream failure when a later variant has zero results', async () => {
    serve(query => answer(query === '幸福不远' ? 2001 : 0));
    await expect(searchQQLyrics('幸福不远')).rejects.toMatchObject({ kind: 'upstream', summary: { requestCode: 2001 } });
});
it.each(['network', 'http', 'invalid-response', 'other-code'])('does not retry %s failures', async kind => {
    const queries = serve(() => {
        if (kind === 'network') throw new TypeError('controlled offline');
        if (kind === 'http') return new Response('{}', { status: 502 });
        if (kind === 'invalid-response') return new Response('{}');
        return answer(1000);
    });
    await expect(searchQQLyrics('幸福不远')).rejects.toMatchObject({ kind: kind === 'other-code' ? 'upstream' : kind });
    expect(queries).toHaveLength(1);
});
it('deduplicates unchanged non-Chinese inputs and skips blank input', async () => {
    const queries = serve(() => answer());
    expect(await searchQQLyrics('Hello')).toEqual([]);
    expect(await searchQQLyrics('   ')).toEqual([]);
    expect(queries).toEqual(['Hello']);
});
