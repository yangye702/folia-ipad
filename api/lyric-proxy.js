import { URL } from 'url';
// 当前文件：Vercel 歌词请求代理函数的 TypeScript 源文件。
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-Folia-Proxy-Phase, X-Folia-Upstream-Status, Retry-After',
    'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
    'Access-Control-Allow-Headers': [
        'X-CSRF-Token',
        'X-Requested-With',
        'Accept',
        'Accept-Version',
        'Content-Length',
        'Content-MD5',
        'Content-Type',
        'Date',
        'X-Api-Version',
        'KG-Rec',
        'KG-RC',
        'KG-CLIENTTIMEMS',
        'mid',
        'x-router',
    ].join(', '),
};
const IGNORED_FORWARD_HEADERS = [
    'host',
    'connection',
    'content-length',
    'origin',
    'referer',
    'cookie',
    'authorization',
    'proxy-authorization',
    'x-vercel-protection-bypass',
];
function isAllowedLyricProxyHost(hostname) {
    return hostname === 'qq.com' || hostname.endsWith('.qq.com') ||
        hostname === 'y.gtimg.cn' || hostname === 'c1.kgimg.com' ||
        hostname === 'kugou.com' || hostname.endsWith('.kugou.com');
}
export default async function handler(req, res) {
    // Allow CORS for the proxy
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    res.setHeader('X-Folia-Proxy-Phase', 'proxy-policy');
    const { url: targetUrlStr } = req.query;
    if (!targetUrlStr) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }
    let phase = 'upstream-connect';
    try {
        const targetUrl = new URL(targetUrlStr);
        const hostname = targetUrl.hostname;
        // Security check: only allow proxying to known lyric provider domains
        const isAllowed = isAllowedLyricProxyHost(hostname);
        if (!isAllowed || !['http:', 'https:'].includes(targetUrl.protocol) || hostname === 'c1.kgimg.com' && (targetUrl.protocol !== 'https:' || Boolean(targetUrl.port && targetUrl.port !== '443')) || targetUrl.username || targetUrl.password || (targetUrl.port && !['80', '443'].includes(targetUrl.port))) {
            return res.status(403).json({ error: 'Forbidden: Domain not allowed' });
        }
        // Filter headers to forward
        const headers = {};
        for (const key of Object.keys(req.headers)) {
            if (!IGNORED_FORWARD_HEADERS.includes(key.toLowerCase())) {
                headers[key] = req.headers[key];
            }
        }
        if (hostname === 'u.y.qq.com') {
            headers.Cookie = 'tmeLoginType=-1;';
            headers['User-Agent'] = 'okhttp/3.14.9';
        }
        // Forward the method and body (if present and method is not GET/HEAD)
        const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
        const fetchOptions = {
            method: req.method,
            redirect: 'manual',
            signal: AbortSignal.timeout(15000),
            headers,
        };
        if (hasBody) {
            if (typeof req.body === 'object') {
                fetchOptions.body = JSON.stringify(req.body);
            }
            else {
                fetchOptions.body = req.body;
            }
        }
        let currentUrl = targetUrl;
        let response = await fetch(currentUrl.toString(), fetchOptions);
        let redirects = 0;
        while ([301, 302, 303, 307, 308].includes(response.status)) {
            if (req.method !== 'GET' || ++redirects > 3)
                return res.status(502).json({ error: 'Unsupported redirect' });
            const location = response.headers.get('location');
            const next = location ? new URL(location, currentUrl) : null;
            if (!next || !isAllowedLyricProxyHost(next.hostname) || !['http:', 'https:'].includes(next.protocol)
                || next.hostname === 'c1.kgimg.com' && next.protocol !== 'https:' || next.username || next.password
                || next.port && !['80', '443'].includes(next.port))
                return res.status(403).json({ error: 'Forbidden redirect' });
            currentUrl = next;
            response = await fetch(next.toString(), { ...fetchOptions, headers: {} });
        }
        phase = 'upstream-body';
        res.setHeader('X-Folia-Proxy-Phase', 'upstream-response');
        res.setHeader('X-Folia-Upstream-Status', String(response.status));
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter && retryAfter.length <= 80 && (/^\d+$/.test(retryAfter) || Number.isFinite(Date.parse(retryAfter))))
            res.setHeader('Retry-After', retryAfter);
        const contentType = response.headers.get('content-type') || '';
        // Forward response headers
        res.setHeader('Content-Type', contentType);
        if (contentType.includes('application/json')) {
            phase = 'upstream-parse';
            const json = await response.json();
            return res.status(response.status).json(json);
        }
        else {
            const buffer = await response.arrayBuffer();
            return res.status(response.status).send(Buffer.from(buffer));
        }
    }
    catch (error) {
        const failurePhase = error?.name === 'TimeoutError' ? 'upstream-timeout' : phase;
        res.setHeader('X-Folia-Proxy-Phase', failurePhase);
        return res.status(failurePhase === 'upstream-timeout' ? 504 : 502).json({ error: 'Proxy request failed', phase: failurePhase });
    }
}
