const cloudSearch = require('@neteasecloudmusicapienhanced/api/module/cloudsearch.js');
const songDetail = require('@neteasecloudmusicapienhanced/api/module/song_detail.js');
const lyricNew = require('@neteasecloudmusicapienhanced/api/module/lyric_new.js');
const songChorus = require('@neteasecloudmusicapienhanced/api/module/song_chorus.js');
const { createSdkTransport } = require('./sdkTransport.cjs');

// Only the four anonymous read operations needed by matching; no account, audio or arbitrary proxy.
const routes = {
    '/cloudsearch': { run: cloudSearch, fields: ['keywords', 'limit', 'offset'] },
    '/song/detail': { run: songDetail, fields: ['ids'] },
    '/lyric/new': { run: lyricNew, fields: ['id'] },
    '/song/chorus': { run: songChorus, fields: ['id'] },
};
const safeCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_BAD_RESPONSE']);
const timedOut = code => code === 'ETIMEDOUT' || code === 'ECONNABORTED';
const integer = (value, min, max) => /^\d+$/.test(String(value)) && Number(value) >= min && Number(value) <= max;
const idPattern = /^[1-9]\d{0,15}$/;

function createReadOnlyHandler(createTransport = createSdkTransport) {
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Folia-Proxy-Phase', 'proxy-policy');
        if (req.method !== 'GET') return res.status(405).json({ error: 'method-not-allowed' });
        const query = req.query || {};
        const route = routes[query.path];
        if (!Object.hasOwn(routes, query.path) || !route) return res.status(404).json({ error: 'read-only-route-unavailable' });
        if (Object.keys(query).some(key => key !== 'path' && !route.fields.includes(key))
            || Object.values(query).some(value => typeof value !== 'string')) return res.status(400).json({ error: 'invalid-parameters' });
        const params = { cookie: {}, timeout: 8000, randomCNIP: false };
        if (query.path === '/cloudsearch') {
            if (!query.keywords?.trim() || query.keywords.length > 120
                || !integer(query.limit ?? '30', 1, 100) || !integer(query.offset ?? '0', 0, 10000)) return res.status(400).json({ error: 'invalid-search' });
            Object.assign(params, { keywords: query.keywords.trim(), limit: Number(query.limit ?? 30), offset: Number(query.offset ?? 0), type: 1 });
        } else if (query.path === '/song/detail') {
            const ids = query.ids?.split(',');
            if (!ids?.length || ids.length > 100 || ids.some(id => !idPattern.test(id))) return res.status(400).json({ error: 'invalid-ids' });
            params.ids = query.ids;
        } else {
            if (!idPattern.test(query.id ?? '')) return res.status(400).json({ error: 'invalid-id' });
            params.id = query.id;
        }
        let facts = {};
        try {
            const transport = createTransport();
            facts = transport.facts;
            const answer = await route.run(params, transport.execute);
            if (facts.httpStatus) res.setHeader('X-Folia-Upstream-Status', String(facts.httpStatus));
            res.setHeader('X-Folia-Proxy-Phase', 'upstream-response');
            if (!answer?.body || typeof answer.body !== 'object' || Array.isArray(answer.body) || !Number.isFinite(answer.body.code)) {
                res.setHeader('X-Folia-Proxy-Phase', 'upstream-parse');
                return res.status(502).json({ error: 'invalid-response' });
            }
            if (answer.body.code !== 200) throw { ...answer, status: integer(answer.body.code, 400, 599) ? answer.body.code : 502 };
            // The read operations return their original payload. Never relay Set-Cookie or SDK cookies.
            const { cookie, token, ...body } = answer.body;
            return res.status(200).json(body);
        } catch (error) {
            const code = safeCodes.has(facts.transportCode) ? facts.transportCode : undefined;
            const phase = facts.httpStatus ? 'upstream-response' : timedOut(code) ? 'upstream-timeout' : 'upstream-connect';
            res.setHeader('X-Folia-Proxy-Phase', phase);
            if (facts.httpStatus) res.setHeader('X-Folia-Upstream-Status', String(facts.httpStatus));
            if (code) res.setHeader('X-Folia-Proxy-Error', code);
            // The SDK rewrites an axios HTTP failure to 502; preserve its real status and Retry-After.
            if (facts.retryAfter) res.setHeader('Retry-After', facts.retryAfter);
            const upstreamCode = typeof facts.upstreamCode === 'number' ? facts.upstreamCode
                : facts.httpStatus === 200 && typeof error?.body?.code === 'number' ? error.body.code : undefined;
            const status = timedOut(code) ? 504 : integer(facts.httpStatus, 400, 599) ? facts.httpStatus
                : facts.httpStatus && integer(error?.status, 400, 599) ? error.status : 502;
            return res.status(status).json({ ...(upstreamCode !== undefined ? { code: upstreamCode } : {}),
                error: facts.httpStatus ? upstreamCode !== undefined ? 'upstream' : 'http' : 'backend-request-failed' });
        }
    };
}
module.exports = { createReadOnlyHandler };
