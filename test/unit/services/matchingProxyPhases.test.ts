import { afterEach, expect, it, vi } from 'vitest';
import handler from '../../../api-ts/lyric-proxy';
import { requestKugouAnonymousSearch } from '@/services/onlineMusic/kugou/kugouTransport';
import { matchFailureFacts } from '@/services/matchingDiagnostics';

// Relay facts must locate the failed hop without exposing raw upstream bodies or credentials.
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const response = () => {
    const headers: Record<string, string> = {};
    const res: any = { setHeader: (key: string, value: string) => { headers[key] = value; }, status: vi.fn(), json: vi.fn(), send: vi.fn() };
    res.status.mockReturnValue(res);
    return { res, headers };
};
it.each([['TimeoutError', 504, 'upstream-timeout'], ['TypeError', 502, 'upstream-connect']])('labels a relay %s failure without returning the raw exception', async (name, status, phase) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('token=do-not-copy'), { name })));
    const { res, headers } = response();
    await handler({ method: 'GET', query: { url: 'http://complexsearch.kugou.com/v2/search/song' }, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(headers['X-Folia-Proxy-Phase']).toBe(phase);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('do-not-copy');
});
it('labels an upstream HTTP response and preserves its Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '30' } })));
    const { res, headers } = response();
    await handler({ method: 'GET', query: { url: 'http://complexsearch.kugou.com/v2/search/song' }, headers: {} }, res);
    expect(headers).toMatchObject({ 'X-Folia-Proxy-Phase': 'upstream-response', 'X-Folia-Upstream-Status': '429', 'Retry-After': '30' });
});
it('retains both the proxy status and the upstream hop in KuGou search errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 502, headers: { 'X-Folia-Proxy-Phase': 'upstream-connect' } })));
    let error: unknown;
    try { await requestKugouAnonymousSearch('Synthetic', 1, 20); } catch (caught) { error = caught; }
    expect(matchFailureFacts(error)).toMatchObject({ httpStatus: 502, proxyPhase: 'upstream-connect', source: 'kugou' });
});
it('classifies invalid KuGou JSON without pretending it was zero results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>fixture</html>', { headers: { 'X-Folia-Proxy-Phase': 'upstream-response' } })));
    await expect(requestKugouAnonymousSearch('Synthetic', 1, 20)).rejects.toMatchObject({ code: 'invalid-response', httpStatus: 200 });
});
