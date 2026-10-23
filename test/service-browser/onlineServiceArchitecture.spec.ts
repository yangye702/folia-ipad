import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import relay from '../../api-ts/lyric-proxy';

// Browser -> same-origin request -> real server handler/SDK -> controlled upstream; no live services.
const require = createRequire(import.meta.url);
const { createReadOnlyHandler } = require('../../shared/netease/readOnlyBackend.cjs');
const { createSdkTransport } = require('../../shared/netease/sdkTransport.cjs');
const makeResponse = () => {
    const output = { status: 200, headers: {} as Record<string, string>, body: '' };
    const res = { setHeader(key: string, value: string) { output.headers[key] = value; },
        status(value: number) { output.status = value; return this; },
        json(value: unknown) { output.body = JSON.stringify(value); },
        send(value: Buffer) { output.body = value.toString(); } };
    return { output, res };
};
test('built-in matching reads search, details and lyrics without login or cookie registration', async ({ page }) => {
    const operations: string[] = [];
    const handler = createReadOnlyHandler(() => createSdkTransport(async (options: any) => {
        operations.push(new URL(options.url).pathname);
        const data = options.url.includes('cloudsearch')
            ? { code: 200, result: { songs: [{ id: 42, name: 'Synthetic', ar: [{ id: 7, name: 'Artist' }], al: { id: 8, name: 'Album', picUrl: 'https://images.test/cover.png' }, dt: 200000 }] } }
            : options.url.includes('lyric') ? { code: 200, lrc: { lyric: '[00:00.00]Synthetic lyric' } }
                : { code: 200, songs: [{ id: 42, name: 'Synthetic', ar: [], al: { id: 8, name: 'Album' }, dt: 200000 }] };
        return { status: 200, headers: {}, data };
    }));
    await page.route('**/api/netease/**', async route => {
        const url = new URL(route.request().url());
        expect(route.request().headers().cookie).toBeUndefined();
        const { output, res } = makeResponse();
        await handler({ method: route.request().method(), query: { ...Object.fromEntries(url.searchParams), path: url.pathname.slice('/api/netease'.length) } }, res);
        await route.fulfill(output);
    });
    await page.goto('/dev-probe.html');
    const result = await page.evaluate(async () => {
        const path = '/src/services/onlineMusic/netease/netease.ts';
        const { neteaseApi } = await import(/* @vite-ignore */ path);
        const search = await neteaseApi.cloudSearch('Synthetic');
        const lyric = await neteaseApi.getLyric(42);
        const details = await neteaseApi.getSongDetail([42]);
        return { code: search.code, title: search.result.songs[0].name, cover: search.result.songs[0].album.coverUrl, lyric: lyric.lrc.lyric, details: details.songs.length };
    });
    expect(result).toEqual({ code: 200, title: 'Synthetic', cover: 'https://images.test/cover.png', lyric: '[00:00.00]Synthetic lyric', details: 1 });
    expect(operations).toEqual(['/eapi/cloudsearch/pc', '/eapi/song/lyric/v1', '/weapi/v3/song/detail']);
});
test('real backend handler preserves HTTP 429 and retry timing through the browser transport', async ({ page }) => {
    const handler = createReadOnlyHandler(() => createSdkTransport(async () => { throw Object.assign(new Error('fixture'), { response: { status: 429, data: {}, headers: { 'retry-after': '30' } } }); }));
    await page.route('**/api/netease/**', async route => {
        const { output, res } = makeResponse();
        await handler({ method: 'GET', query: { path: '/cloudsearch', keywords: 'Synthetic' } }, res);
        await route.fulfill(output);
    });
    await page.goto('/dev-probe.html');
    const facts = await page.evaluate(async () => {
        const load = (path: string) => import(/* @vite-ignore */ path);
        const { neteaseApi } = await load('/src/services/onlineMusic/netease/netease.ts');
        const { matchFailureFacts } = await load('/src/services/matchingDiagnostics.ts');
        try { await neteaseApi.cloudSearch('Synthetic'); } catch (error) { return matchFailureFacts(error); }
    });
    expect(facts).toMatchObject({ kind: 'http', httpStatus: 429, upstreamHttpStatus: 429, retryAfterMs: 30000 });
    expect(facts?.upstreamCode).toBeUndefined();
});
test('QQ retains script fallback while sending the upstream-compatible song type', async ({ page }) => {
    const queries: string[] = [];
    await page.route('**/api/lyric-proxy?**', async route => {
        const payload = route.request().postDataJSON();
        expect(payload.request.param.search_type).toBe(7);
        expect(payload.request.method).toBe('DoSearchForQQMusicLite');
        queries.push(payload.request.param.query);
        await route.fulfill({ json: { code: 0, request: { code: queries.length === 1 ? 2001 : 0, data: { body: { item_song: queries.length === 1 ? [] : [{ id: 42, mid: 'synthetic', title: '合成测试', singer: [{ name: '测试歌手' }], album: { name: 'Album' }, interval: 200 }] } } } } });
    });
    await page.goto('/dev-probe.html?qqLyricDebug=1');
    const result = await page.evaluate(async () => {
        const load = (path: string) => import(/* @vite-ignore */ path);
        const { searchQQLyrics } = await load('/src/services/onlineMusic/qq/qqLyricProvider.ts');
        const { getQqSearchDiagnostics } = await load('/src/services/onlineMusic/qq/qqLyricSearchStatus.ts');
        return { songs: await searchQQLyrics('合成测试 - 测试歌手'), diagnostics: getQqSearchDiagnostics() };
    });
    expect(result.songs).toHaveLength(1);
    expect(queries).toEqual(['合成测试 - 测试歌手', '合成測試 - 測試歌手']);
    expect(result.diagnostics.map((entry: any) => [entry.searchType, entry.outcome])).toEqual([[7, 'upstream'], [7, 'success']]);
});
test('KuGou distinguishes a relay DNS failure, upstream HTTP and unreadable JSON', async ({ page }) => {
    for (const mode of ['dns', 'http', 'parse']) {
        await test.step(mode, async () => {
            await page.route('**/api/lyric-proxy?**', async route => {
                const originalFetch = globalThis.fetch;
                const { output, res } = makeResponse();
                try {
                    globalThis.fetch = async () => {
                        if (mode === 'dns') throw new TypeError('private fixture', { cause: { code: 'ENOTFOUND' } });
                        return new Response(mode === 'parse' ? '<html>fixture</html>' : '{}', { status: mode === 'http' ? 403 : 200, headers: { 'content-type': 'application/json' } });
                    };
                    const target = new URL(route.request().url()).searchParams.get('url');
                    await relay({ method: 'GET', query: { url: target }, headers: {} }, res);
                } finally { globalThis.fetch = originalFetch; }
                await route.fulfill(output);
            });
            await page.goto('/dev-probe.html');
            const facts = await page.evaluate(async () => {
                const load = (path: string) => import(/* @vite-ignore */ path);
                const { requestKugouAnonymousSearch } = await load('/src/services/onlineMusic/kugou/kugouTransport.ts');
                const { matchFailureFacts } = await load('/src/services/matchingDiagnostics.ts');
                try { await requestKugouAnonymousSearch('Synthetic', 1, 10); } catch (error) { return matchFailureFacts(error); }
            });
            expect(facts).toMatchObject(mode === 'dns' ? { httpStatus: 502, proxyPhase: 'upstream-connect', transportCode: 'ENOTFOUND' }
                : mode === 'http' ? { httpStatus: 403, upstreamHttpStatus: 403, proxyPhase: 'upstream-response' }
                    : { kind: 'invalid-response', httpStatus: 502, proxyPhase: 'upstream-parse', upstreamHttpStatus: 200 });
            await page.unroute('**/api/lyric-proxy?**');
        });
    }
});
test('same-origin preview authentication survives while upstream requests stay anonymous', async ({ page, context }) => {
    await context.addCookies([{ name: 'preview-access', value: 'synthetic-private-gate', url: 'http://127.0.0.1:4174' }]);
    await page.route('https://auth.example.test/**', route => route.fulfill({ contentType: 'text/html', body: 'Synthetic sign-in gate' }));
    const backend = createReadOnlyHandler(() => createSdkTransport(async (options: any) => {
        expect(JSON.stringify(options.headers)).not.toContain('synthetic-private-gate');
        return { status: 200, headers: {}, data: { code: 200, result: { songs: [] } } };
    }));
    await page.route('**/api/**', async route => {
        if (!route.request().headers().cookie?.includes('preview-access=')) {
            await route.fulfill({ status: 302, headers: { location: 'https://auth.example.test/sign-in' } });
            return;
        }
        const { output, res } = makeResponse();
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/api/netease/')) {
            await backend({ method: 'GET', query: { path: '/cloudsearch', keywords: 'Synthetic' }, headers: route.request().headers() }, res);
        } else {
            const originalFetch = globalThis.fetch;
            try {
                globalThis.fetch = async (_url, options) => {
                    expect(JSON.stringify(options?.headers)).not.toContain('synthetic-private-gate');
                    return Response.json({ error_code: 0, data: { lists: [] } });
                };
                await relay({ method: 'GET', query: { url: url.searchParams.get('url') }, headers: route.request().headers() }, res);
            } finally { globalThis.fetch = originalFetch; }
        }
        await route.fulfill(output);
    });
    await page.goto('/dev-probe.html');
    const result = await page.evaluate(async () => {
        const load = (path: string) => import(/* @vite-ignore */ path);
        // Control: an omitted site cookie yields an auth redirect and CORS network failure.
        const omitted = await fetch('/api/lyric-proxy?url=fixture', { credentials: 'omit' }).then(() => 'response', error => error.name);
        const { requestKugouAnonymousSearch } = await load('/src/services/onlineMusic/kugou/kugouTransport.ts');
        const { neteaseApi } = await load('/src/services/onlineMusic/netease/netease.ts');
        const outcomes: Record<string, unknown> = { omitted };
        try { outcomes.kugou = await requestKugouAnonymousSearch('Synthetic', 1, 10); } catch (error: any) { outcomes.kugou = error.code; }
        try { outcomes.netease = await neteaseApi.cloudSearch('Synthetic'); } catch (error: any) { outcomes.netease = error.networkFailure ? 'network' : error.code; }
        return outcomes;
    });
    expect(result).toMatchObject({ omitted: 'TypeError', kugou: { error_code: 0 }, netease: { code: 200 } });
});
