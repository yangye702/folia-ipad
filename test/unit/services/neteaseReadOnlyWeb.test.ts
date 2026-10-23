import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The optional same-origin read-only backend must never borrow account credentials.
beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_NETEASE_API_BASE', '');
    vi.stubEnv('VITE_NETEASE_READONLY_API_BASE', '/api/netease');
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'private-cookie'), setItem: vi.fn(), removeItem: vi.fn() });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('searches through the built-in read-only backend without provider registration or stored credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 200, result: { songs: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    const { neteaseApi } = await import('@/services/onlineMusic/netease/netease');
    await expect(neteaseApi.cloudSearch('Synthetic')).resolves.toMatchObject({ code: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/netease/cloudsearch?keywords=Synthetic&limit=30&offset=0');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin');
    expect(localStorage.getItem).not.toHaveBeenCalled();
});
it('keeps a configured full backend ahead of the read-only fallback', async () => {
    vi.stubEnv('VITE_NETEASE_API_BASE', 'https://configured.test');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 200, result: { songs: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    const { neteaseApi } = await import('@/services/onlineMusic/netease/netease');
    await neteaseApi.cloudSearch('Synthetic');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/configured.test\/cloudsearch\?/);
});
it('does not claim the read-only backend supports login', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { neteaseApi } = await import('@/services/onlineMusic/netease/netease');
    await expect(neteaseApi.getLoginStatus()).rejects.toMatchObject({ code: 'NETEASE_API_BASE_MISSING' });
    expect(fetch).not.toHaveBeenCalled();
});
it('preserves safe proxy facts when the backend reports a connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 502, error: 'backend-request-failed' }, { status: 502, headers: { 'X-Folia-Proxy-Phase': 'upstream-connect', 'X-Folia-Proxy-Error': 'ENOTFOUND' } })));
    const { neteaseApi } = await import('@/services/onlineMusic/netease/netease');
    await expect(neteaseApi.cloudSearch('Synthetic')).rejects.toMatchObject({ httpStatus: 502, proxyPhase: 'upstream-connect', transportCode: 'ENOTFOUND' });
});
it('keeps relay facts for non-JSON gateway errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>fixture</html>', { status: 502, headers: { 'X-Folia-Proxy-Phase': 'upstream-body', 'X-Folia-Upstream-Status': '200', 'X-Folia-Proxy-Error': 'UND_ERR_BODY_TIMEOUT' } })));
    const { neteaseApi } = await import('@/services/onlineMusic/netease/netease');
    await expect(neteaseApi.cloudSearch('Synthetic')).rejects.toMatchObject({ kind: 'invalid-response', httpStatus: 502, proxyPhase: 'upstream-body', upstreamHttpStatus: 200, transportCode: 'UND_ERR_BODY_TIMEOUT' });
});
