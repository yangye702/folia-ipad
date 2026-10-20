// src/services/lyricProxy.ts

/**
 * The app's own relay for outside hosts a web page cannot fetch directly (QQ and KuGou lyric
 * hosts, the AMLL lyric database, QQ and KuGou cover pictures). This file is the only place in
 * the renderer that knows the relay's web address and its desktop bridge.
 *
 * Server sides, each with its own allow-list of hosts: api/lyric-proxy.js, api-ts/lyric-proxy.ts
 * and worker/lyric-proxy.ts on the web; proxyLyricRequest in electron/main.cjs (IPC
 * lyric-proxy-fetch) on the desktop.
 *
 * It lives in src/services/ because lyric code, a platform's transport and the cover cache all
 * use it, and none of them owns it.
 *
 * Which route a caller takes (the target directly, the web address or the bridge) stays the
 * caller's own choice; this file only names the two relay routes.
 */

type LyricProxyBridge = NonNullable<Window['electron']>['fetchLyricProxy'];

/** The relay's address on the web for one target URL. */
export const lyricProxyWebUrl = (targetUrl: string): string => (
    `/api/lyric-proxy?url=${encodeURIComponent(targetUrl)}`
);

/**
 * Sends one request through the desktop bridge. Returns null, without sending anything, when
 * the bridge is not there (the web, or a desktop preload without it), so the caller can take
 * its other route.
 */
export const requestLyricProxyOnDesktop = (
    ...args: Parameters<LyricProxyBridge>
): ReturnType<LyricProxyBridge> | null => {
    if (typeof window === 'undefined' || !window.electron?.fetchLyricProxy) return null;
    return window.electron.fetchLyricProxy(...args);
};

/** Only controlled scalar response facts; never export URLs, headers or response bodies. */
export const readLyricProxyResponseFacts = (response: Response) => {
    const phase = response.headers?.get?.('X-Folia-Proxy-Phase');
    const proxyPhase = phase && ['proxy-policy', 'upstream-response', 'upstream-connect', 'upstream-timeout', 'upstream-body', 'upstream-parse'].includes(phase) ? phase : undefined;
    const transportCode = response.headers?.get?.('X-Folia-Proxy-Error');
    const safeCodes = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_BAD_RESPONSE'];
    const status = Number(response.headers?.get?.('X-Folia-Upstream-Status'));
    const upstreamHttpStatus = status >= 100 && status <= 599 ? status : undefined;
    const retry = response.headers?.get?.('Retry-After')?.trim();
    const retryAfterMs = retry ? /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now() : undefined;
    return { ...(transportCode && safeCodes.includes(transportCode) ? { transportCode } : {}), ...(proxyPhase ? { proxyPhase } : {}), ...(upstreamHttpStatus ? { upstreamHttpStatus } : {}),
        ...(retryAfterMs != null && Number.isFinite(retryAfterMs) && retryAfterMs >= 0 ? { retryAfterMs } : {}) };
};

/** Preserve the browser failure category, never its URL-bearing message or stack. */
export const readBrowserRequestFailure = (error: unknown) => {
    const name = (error as { name?: unknown } | null)?.name;
    return typeof name === 'string' && ['TypeError', 'TimeoutError', 'AbortError', 'SecurityError', 'NotSupportedError', 'SyntaxError'].includes(name)
        ? { browserErrorName: name } : {};
};
