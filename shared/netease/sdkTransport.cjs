const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const { compileFunction } = require('node:vm');

// Run the pinned SDK's original request implementation without its raw body/cookie logging.
const requestPath = require.resolve('@neteasecloudmusicapienhanced/api/util/request.js');
const sdkRequire = createRequire(requestPath);
const requestFactory = compileFunction(fs.readFileSync(requestPath, 'utf8'),
    ['exports', 'require', 'module', '__filename', '__dirname', 'console'], { filename: requestPath });
const anonymousTokenPath = path.join(os.tmpdir(), 'anonymous_token');
const quietConsole = { log() {}, info() {}, warn() {}, error() {}, debug() {} };

// A scoped require keeps SDK diagnostics private and captures the real HTTP hop before the SDK
// folds HTTP/network failures into its own {status, body}. It never patches global console/axios.
function createSdkTransport(axiosRequest = sdkRequire('axios').default) {
    const facts = {};
    const observe = response => {
        if (!response) return;
        facts.httpStatus = response.status;
        if (typeof response.data?.code === 'number') facts.upstreamCode = response.data.code;
        const retry = response.headers?.['retry-after'];
        if (typeof retry === 'string' && retry.length <= 80 && (/^\d+$/.test(retry) || Number.isFinite(Date.parse(retry)))) facts.retryAfter = retry;
    };
    const scopedRequire = id => {
        if (id === 'fs') return { ...fs, readFileSync: (file, ...args) =>
            path.resolve(String(file)) === anonymousTokenPath ? '' : fs.readFileSync(file, ...args) };
        if (id !== 'axios') return sdkRequire(id);
        return { default: async options => {
            try {
                const answer = await axiosRequest({ ...options, maxRedirects: 0, maxContentLength: 4 * 1024 * 1024 });
                observe(answer);
                return answer;
            } catch (error) {
                observe(error?.response);
                // Only this scalar is exported; messages, headers and configuration never are.
                facts.transportCode = error?.code;
                throw error;
            }
        } };
    };
    const module = { exports: {} };
    requestFactory(module.exports, scopedRequire, module, requestPath, path.dirname(requestPath), quietConsole);
    return { execute: module.exports, facts };
}
module.exports = { createSdkTransport };
