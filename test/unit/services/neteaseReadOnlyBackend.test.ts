import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';

// Exercise the original SDK modules against an isolated transport, never a user's music database.
const require = createRequire(import.meta.url);
const { createReadOnlyHandler } = require('../../../shared/netease/readOnlyBackend.cjs');
const response = () => {
    const headers: Record<string, string> = {};
    const res: any = { setHeader: (key: string, value: string) => { headers[key] = value; }, status: vi.fn(), json: vi.fn(), end: vi.fn() };
    res.status.mockReturnValue(res);
    return { res, headers };
};
const request = (path: string, fields = {}, method = 'GET') => ({ method, query: { path, ...fields }, headers: { cookie: 'private-cookie', authorization: 'private-auth' } });
it('runs the original cloudsearch module with bounded, anonymous options', async () => {
    const execute = vi.fn(async () => ({ status: 200, body: { code: 200, result: { songs: [] } }, cookie: ['private-cookie'] }));
    const handler = createReadOnlyHandler(() => ({ execute, facts: {} }));
    const { res } = response();
    await handler(request('/cloudsearch', { keywords: 'Synthetic', limit: '20', offset: '0' }), res);
    expect(execute).toHaveBeenCalledWith('/api/cloudsearch/pc', expect.objectContaining({ s: 'Synthetic', limit: 20 }), expect.objectContaining({ cookie: {}, timeout: 8000, crypto: '', randomCNIP: false }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ code: 200, result: { songs: [] } });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private');
});
it.each(['/login/qr/key', '/song/url/v1', '/user/cloud', '/register/anonimous'])('does not expose %s', async path => {
    const execute = vi.fn();
    const { res } = response();
    await createReadOnlyHandler(() => ({ execute, facts: {} }))(request(path), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(execute).not.toHaveBeenCalled();
});
it.each([{ keywords: 'Synthetic', proxy: 'http://127.0.0.1' }, { keywords: 'Synthetic', cookie: 'secret' }, { keywords: 'Synthetic', domain: 'http://169.254.169.254' }, { keywords: 'Synthetic', limit: '100000' }])('rejects unsafe or unbounded options %o', async fields => {
    const execute = vi.fn();
    const { res } = response();
    await createReadOnlyHandler(() => ({ execute, facts: {} }))(request('/cloudsearch', fields), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(execute).not.toHaveBeenCalled();
});
it.each([
    ['/lyric/new', { id: '42' }, '/api/song/lyric/v1'],
    ['/song/detail', { ids: '42,43' }, '/api/v3/song/detail'],
    ['/song/chorus', { id: '42' }, '/api/song/chorus'],
])('supports the original read-only %s module', async (path, fields, apiPath) => {
    const execute = vi.fn(async (..._args: any[]) => ({ status: 200, body: { code: 200 } }));
    const { res } = response();
    await createReadOnlyHandler(() => ({ execute, facts: {} }))(request(path, fields), res);
    expect(execute.mock.calls[0][0]).toBe(apiPath);
    expect(res.status).toHaveBeenCalledWith(200);
});
it('retains actual HTTP 200 separately from an upstream refusal', async () => {
    const execute = vi.fn(async () => { throw { status: 403, body: { code: 403, cookie: 'private' }, cookie: ['private'] }; });
    const { res, headers } = response();
    await createReadOnlyHandler(() => ({ execute, facts: { httpStatus: 200 } }))(request('/cloudsearch', { keywords: 'Synthetic' }), res);
    expect(headers).toMatchObject({ 'X-Folia-Proxy-Phase': 'upstream-response', 'X-Folia-Upstream-Status': '200' });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ code: 403, error: 'upstream' });
});
it('distinguishes backend connection failure without copying the SDK exception', async () => {
    const execute = vi.fn(async () => { throw { status: 502, body: { code: 502, msg: 'private-cookie' } }; });
    const { res, headers } = response();
    await createReadOnlyHandler(() => ({ execute, facts: { transportCode: 'ENOTFOUND' } }))(request('/cloudsearch', { keywords: 'Synthetic' }), res);
    expect(headers).toMatchObject({ 'X-Folia-Proxy-Phase': 'upstream-connect', 'X-Folia-Proxy-Error': 'ENOTFOUND' });
    expect(res.status).toHaveBeenCalledWith(502);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private');
});
it('rejects invalid JSON body shapes instead of returning zero results', async () => {
    const execute = vi.fn(async () => ({ status: 200, body: '<html>fixture</html>' }));
    const { res, headers } = response();
    await createReadOnlyHandler(() => ({ execute, facts: { httpStatus: 200 } }))(request('/cloudsearch', { keywords: 'Synthetic' }), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(headers['X-Folia-Proxy-Phase']).toBe('upstream-parse');
});
it('uses the SDK eapi request and captures real HTTP separately without logging cookies', async () => {
    const { createSdkTransport } = require('../../../shared/netease/sdkTransport.cjs');
    const axios = vi.fn(async (_options: any) => ({ status: 200, headers: { 'set-cookie': ['private-cookie'] }, data: { code: 200, result: { songs: [] } } }));
    const { res, headers } = response();
    await createReadOnlyHandler(() => createSdkTransport(axios))(request('/cloudsearch', { keywords: 'Synthetic' }), res);
    expect(axios.mock.calls[0][0]).toMatchObject({ url: 'https://interfacepc.music.163.com/eapi/cloudsearch/pc', method: 'POST', timeout: 8000, maxRedirects: 0 });
    expect(axios.mock.calls[0][0].data).toMatch(/^params=/);
    expect(headers['X-Folia-Upstream-Status']).toBe('200');
    expect(res.json).toHaveBeenCalledWith({ code: 200, result: { songs: [] } });
});
it('scopes SDK raw-error suppression and classifies the real transport failure', async () => {
    const { createSdkTransport } = require('../../../shared/netease/sdkTransport.cjs');
    const log = vi.spyOn(console, 'log');
    const axios = vi.fn(async () => { throw Object.assign(new Error('private-cookie'), { code: 'ENOTFOUND' }); });
    const { res, headers } = response();
    await createReadOnlyHandler(() => createSdkTransport(axios))(request('/cloudsearch', { keywords: 'Synthetic' }), res);
    expect(headers['X-Folia-Proxy-Error']).toBe('ENOTFOUND');
    expect(log).not.toHaveBeenCalled();
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private');
    log.mockRestore();
});
it('does not turn a decoded upstream refusal into a zero-result success', async () => {
    const execute = vi.fn(async () => ({ status: 200, body: { code: 403, result: { songs: [] } } }));
    const { res } = response();
    await createReadOnlyHandler(() => ({ execute, facts: { httpStatus: 200 } }))(request('/cloudsearch', { keywords: 'Synthetic' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
});
it('preserves HTTP 429 and Retry-After rather than the SDK synthetic 502', async () => {
    const { createSdkTransport } = require('../../../shared/netease/sdkTransport.cjs');
    const axios = vi.fn(async () => { throw Object.assign(new Error('fixture'), { response: { status: 429, data: 'busy', headers: { 'retry-after': '30' } }, code: 'ERR_BAD_REQUEST' }); });
    const { res, headers } = response();
    await createReadOnlyHandler(() => createSdkTransport(axios))(request('/cloudsearch', { keywords: 'Synthetic' }), res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(headers['Retry-After']).toBe('30');
    expect(res.json).toHaveBeenCalledWith({ error: 'http' });
});
