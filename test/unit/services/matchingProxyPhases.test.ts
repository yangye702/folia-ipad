import { afterEach, expect, it, vi } from 'vitest';
import handler from '../../../api-ts/lyric-proxy';
import { requestKugouAnonymousSearch } from '@/services/onlineMusic/kugou/kugouTransport';
import { matchFailureFacts } from '@/services/matchingDiagnostics';

// Relay facts must locate the failed hop without exposing raw upstream bodies or credentials.
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
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
it('returns the proxy timeout before the 12-second browser deadline', async () => {
    vi.useFakeTimers();
    // Native AbortSignal.timeout is independent of Vitest's clock; replace only its clock boundary.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('fixture', 'TimeoutError')), ms);
        return controller.signal;
    });
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
    })));
    const { res, headers } = response();
    const pending = handler({ method: 'GET', query: { url: 'http://complexsearch.kugou.com/v2/search/song' }, headers: {} }, res);
    await vi.advanceTimersByTimeAsync(11000);
    expect(res.status).toHaveBeenCalledWith(504);
    expect(headers['X-Folia-Proxy-Phase']).toBe('upstream-timeout');
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    vi.useRealTimers();
});
it('reports a safe DNS code without leaking error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('private-cookie', { cause: { code: 'ENOTFOUND', hostname: 'private-host' } })));
    const { res, headers } = response();
    await handler({ method: 'GET', query: { url: 'http://complexsearch.kugou.com/v2/search/song' }, headers: {} }, res);
    expect(headers['X-Folia-Proxy-Error']).toBe('ENOTFOUND');
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private');
});
it('keeps the browser exception category when no proxy response arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('private message', 'SecurityError')));
    let error: unknown;
    try { await requestKugouAnonymousSearch('Synthetic', 1, 20); } catch (caught) { error = caught; }
    expect(matchFailureFacts(error)).toMatchObject({ stage: 'search-request', browserErrorName: 'SecurityError' });
    expect(JSON.stringify(matchFailureFacts(error))).not.toContain('private');
});
