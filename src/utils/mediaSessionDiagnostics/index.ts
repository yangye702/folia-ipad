// Temporary opt-in, device-local transport evidence. Never stores song IDs, names, URLs or errors' text.
type Fields = Record<string, string | number | boolean | null>;
export type DiagnosticEvent = { time: string; run: number; phase: string; scenario: string; command: number; fields: Fields };
const KEY = 'folia-media-session-diagnostics-v1';
const LIMIT = 200;
const run = Date.now();
let enabled = false;
try {
    enabled = typeof window !== 'undefined' && new URLSearchParams(window.location?.search || '').get('mediaSessionDebug') === '1';
} catch { /* Partial/non-browser runtimes must remain disabled. */ }
let events: DiagnosticEvent[] = [];
let scenario = 'unspecified';
let command = 0;
const listeners = new Set<() => void>();
const tokens = new Map<string, number>();
if (enabled) {
    try { events = JSON.parse(sessionStorage.getItem(KEY) || '[]').slice(-LIMIT); } catch { /* Storage can be unavailable. */ }
}
export const diagnosticsEnabled = () => enabled;
export const diagnosticTrack = (key: string | null): string => {
    if (!enabled || key === null) return 'none';
    if (!tokens.has(key)) tokens.set(key, tokens.size + 1);
    return `track-${tokens.get(key)}`;
};
export function recordMediaDiagnostic(phase: string, fields: Fields = {}): void {
    if (!enabled) return;
    // Diagnostics must never throw into a playback or Media Session handler.
    try {
        events.push({ time: new Date().toISOString(), run, phase, scenario, command, fields });
        events = events.slice(-LIMIT);
        try { sessionStorage.setItem(KEY, JSON.stringify(events)); } catch { /* Keep the in-memory ring. */ }
        listeners.forEach(listener => listener());
    } catch { /* Observation must not affect transport. */ }
}
export function beginMediaDiagnostic(action: string): void {
    if (!enabled) return;
    command += 1;
    recordMediaDiagnostic('callback.received', { action, visibility: document.visibilityState });
}
export const recordMediaDiagnosticError = (phase: string, error: unknown): void => {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const safeNames = ['Error', 'TypeError', 'AbortError', 'NotAllowedError', 'NotSupportedError', 'QuotaExceededError', 'NetworkError', 'SecurityError', 'InvalidStateError', 'NotFoundError'];
    recordMediaDiagnostic(phase, { errorType: safeNames.includes(name) ? name : 'UnknownError' });
};
export const mediaDiagnosticSnapshot = () => events.map(event => ({ ...event, fields: { ...event.fields } }));

// A touch-only overlay outside the normal player; enabled solely by the explicit URL parameter.
export function mountMediaDiagnostics(labels: { entry: string; close: string; copy: string; disable: string; select: string; controlCenter: string; lockScreen: string }): () => void {
    if (!enabled) return () => {};
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:env(safe-area-inset-top,8px);right:8px;z-index:2147483647;max-width:94vw;color:#fff;background:#222;border-radius:8px;padding:8px;font:14px sans-serif;pointer-events:auto';
    const entry = document.createElement('button');
    entry.textContent = labels.entry;
    entry.style.cssText = 'min-height:44px;padding:8px';
    const panel = document.createElement('div');
    panel.hidden = true;
    const output = document.createElement('textarea');
    output.readOnly = true;
    output.setAttribute('aria-label', labels.entry);
    output.style.cssText = 'display:block;width:80vw;max-width:650px;height:45vh;color:#fff;background:#111;font:12px monospace;user-select:text;-webkit-user-select:text';
    const render = () => { if (!panel.hidden) output.value = JSON.stringify({ version: 1, events }, null, 2); };
    const button = (text: string, click: () => void) => {
        const node = document.createElement('button'); node.textContent = text;
        node.style.cssText = 'min-height:44px;padding:8px;margin:2px'; node.onclick = click; panel.append(node);
    };
    button(labels.controlCenter, () => { scenario = 'control-center'; recordMediaDiagnostic('scenario.mark'); });
    button(labels.lockScreen, () => { scenario = 'lock-screen'; recordMediaDiagnostic('scenario.mark'); });
    button(labels.copy, () => {
        render();
        output.focus(); output.select(); output.setSelectionRange(0, output.value.length);
        // Keep selection available for Safari's touch Copy menu when clipboard permission is denied.
        void navigator.clipboard?.writeText(output.value).catch(() => {});
    });
    button(labels.select, () => { render(); output.focus(); output.select(); output.setSelectionRange(0, output.value.length); });
    button(labels.close, () => { panel.hidden = true; });
    button(labels.disable, () => {
        recordMediaDiagnostic('diagnostics.disabled'); enabled = false;
        try { sessionStorage.removeItem(KEY); } catch { /* Only our diagnostic key is touched. */ }
        events = []; tokens.clear(); cleanup();
    });
    panel.append(output); host.append(entry, panel); document.body.append(host);
    entry.onclick = () => { panel.hidden = !panel.hidden; render(); };
    listeners.add(render);
    const lifecycle = () => recordMediaDiagnostic('document.visibility', { visibility: document.visibilityState });
    const rejection = (event: PromiseRejectionEvent) => recordMediaDiagnosticError('window.unhandledrejection', event.reason);
    const error = (event: ErrorEvent) => recordMediaDiagnosticError('window.error', event.error);
    document.addEventListener('visibilitychange', lifecycle);
    window.addEventListener('unhandledrejection', rejection);
    window.addEventListener('error', error);
    recordMediaDiagnostic('diagnostics.started', { secureContext: window.isSecureContext, mediaSession: 'mediaSession' in navigator });
    const cleanup = () => {
        host.remove(); listeners.delete(render);
        document.removeEventListener('visibilitychange', lifecycle);
        window.removeEventListener('unhandledrejection', rejection);
        window.removeEventListener('error', error);
    };
    return cleanup;
}
