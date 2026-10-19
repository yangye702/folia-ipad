import { afterEach, expect, it, vi } from 'vitest';
import { beginQqSearchDiagnostic, emptyQqSearchSummary, getQqSearchDiagnostics, readQqSearchResponse } from '@/services/onlineMusic/qq/qqLyricSearchStatus';

// Safe summaries retain the two upstream codes independently, never response bodies or headers.
afterEach(() => vi.unstubAllGlobals());
it('retains proxy HTTP status, both rejection codes and unknown count', async () => {
    const observe = vi.fn();
    const response = new Response(JSON.stringify({ code: 9, request: { code: 2001 } }), { status: 200 });
    await expect(readQqSearchResponse(response, observe)).rejects.toMatchObject({ kind: 'upstream', summary: { httpStatus: 200, topCode: 9, requestCode: 2001, resultCount: null } });
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ httpStatus: 200 }));
});
it('uses HTTP failure when a proxy error is not a QQ envelope', async () => {
    await expect(readQqSearchResponse(new Response(JSON.stringify({ error: 'private raw response' }), { status: 502 }), () => {}))
        .rejects.toMatchObject({ kind: 'http', summary: { httpStatus: 502, responseKind: 'unknown', topCode: null, requestCode: null, resultCount: null } });
});
it('records nothing by default or for ordinary song search, and bounds opt-in summaries to 30', () => {
    const before = getQqSearchDiagnostics();
    vi.stubGlobal('window', { location: { search: '' } });
    beginQqSearchDiagnostic('not recorded', '/api/lyric-proxy')({ outcome: 'success' });
    expect(getQqSearchDiagnostics()).toBe(before);
    vi.stubGlobal('window', { location: { search: '?qqLyricDebug=1' } });
    beginQqSearchDiagnostic('ordinary search', '/api/lyric-proxy', false)({ outcome: 'success' });
    expect(getQqSearchDiagnostics()).toBe(before);
    for (let i = 0; i < 35; i++) beginQqSearchDiagnostic(`query-${i}`, '/api/lyric-proxy')({ ...emptyQqSearchSummary(), httpStatus: 200, topCode: 0, requestCode: 0, listShape: 'array', resultCount: 0, outcome: 'success' });
    expect(getQqSearchDiagnostics()).toHaveLength(30);
    expect(getQqSearchDiagnostics().at(-1)).toMatchObject({ query: 'query-34', resultCount: 0 });
    expect(Object.keys(getQqSearchDiagnostics()[0]).sort()).toEqual(['operation','httpStatus','id','listShape','outcome','query','requestCode','responseKind','resultCount','time','topCode','via'].sort());
});
