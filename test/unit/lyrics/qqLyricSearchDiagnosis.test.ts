import { afterEach, expect, it, vi } from 'vitest';
import { searchQQLyrics, searchQQSongs } from '@/services/onlineMusic/qq/qqLyricProvider';
import handler from '../../../api-ts/lyric-proxy';

// Regression coverage for separating failed QQ searches from legitimate zero matches.
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

it.each(['幸福不远 - 郭书瑶', '幸福不远', '幸福不遠'])('sends exactly one anonymous POST with the unchanged query %s', async keyword => {
    const request = vi.fn().mockResolvedValue(response({ code: 0, request: { code: 0, data: { body: { item_song: [] } } } }));
    vi.stubGlobal('fetch', request);
    expect(await searchQQSongs(keyword)).toEqual([]);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(new URL(url, 'https://folia.test').searchParams.get('url')).toBe('https://u.y.qq.com/cgi-bin/musicu.fcg');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body);
    expect(payload.request).toMatchObject({ method: 'DoSearchForQQMusicLite', module: 'music.search.SearchCgiService', param: { query: keyword, page_num: 1, num_per_page: 20 } });
    expect(payload.comm.uid).toBe('0');
    expect(payload.comm).not.toHaveProperty('sid');
});

it.each([
    ['http', () => response({ code: 403 }, 403)],
    ['upstream', () => response({ code: 2001 })],
    ['upstream', () => response({ code: 0, request: { code: 2001 } })],
    ['invalid-response', () => new Response('<html>upstream error</html>')],
    ['network', () => { throw new TypeError('controlled network failure'); }],
])('reports %s failures instead of returning zero matches', async (_name, answer) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => answer()));
    await expect(searchQQLyrics('幸福不远')).rejects.toMatchObject({ kind: _name });
});

it.each([
    {}, { body: {} }, { body: { item_song: null } },
])('rejects missing/null song lists as invalid responses: %j', async data => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ code: 0, request: { code: 0, data } })));
    await expect(searchQQLyrics('幸福不远')).rejects.toMatchObject({ kind: 'invalid-response' });
    expect(error).not.toHaveBeenCalled();
});
it('rejects a non-array song list as an invalid response', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ code: 0, request: { code: 0, data: { body: { item_song: {} } } } })));
    await expect(searchQQLyrics('幸福不远')).rejects.toMatchObject({ kind: 'invalid-response' });
    expect(error).not.toHaveBeenCalled();
});
it('the underlying song search does preserve refusal as an exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ code: 0, request: { code: 2001 } })));
    await expect(searchQQSongs('幸福不远')).rejects.toThrow('2001');
});

it.each([200, 403, 502])('Vercel proxy forwards POST body and preserves upstream HTTP %i', async status => {
    const body = { comm: { uid: '0' }, request: { param: { query: '幸福不远' } } };
    const upstream = { code: status === 200 ? 0 : 2001, request: { code: 2001 } };
    const fetchMock = vi.fn().mockResolvedValue(response(upstream, status));
    vi.stubGlobal('fetch', fetchMock);
    const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn(), send: vi.fn() };
    res.status.mockReturnValue(res);
    await handler({ method: 'POST', query: { url: 'https://u.y.qq.com/cgi-bin/musicu.fcg' }, headers: { 'content-type': 'application/json' }, body }, res);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://u.y.qq.com/cgi-bin/musicu.fcg');
    expect(init.method).toBe('POST'); expect(JSON.parse(init.body)).toEqual(body);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith(upstream);
});
it('returns the actual number of candidates for the currently expected successful schema', async () => {
    const item = (id: number) => ({ id, mid: `fixture-${id}`, title: 'controlled fixture', interval: 60, singer: [], album: {} });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ code: 0, request: { code: 0, data: { body: { item_song: [item(1), item(2)] } } } })));
    expect(await searchQQLyrics('幸福不远')).toHaveLength(2);
});
it('Vercel proxy also forwards an already serialized JSON request body unchanged', async () => {
    const serialized = JSON.stringify({ request: { param: { query: '幸福不遠' } } });
    const fetchMock = vi.fn().mockResolvedValue(response({ code: 0, request: { code: 0, data: { body: { item_song: [] } } } }));
    vi.stubGlobal('fetch', fetchMock);
    const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
    await handler({ method: 'POST', query: { url: 'https://u.y.qq.com/cgi-bin/musicu.fcg' }, headers: { 'content-type': 'application/json' }, body: serialized }, res);
    expect(fetchMock.mock.calls[0][1].body).toBe(serialized);
});
