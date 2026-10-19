// Bounded opt-in matching evidence. Only whitelisted scalar facts leave the error boundary.
export class MatchFailure extends Error {
    constructor(public readonly kind: string, public readonly stage: string, public readonly source?: string, public readonly causes?: unknown[]) {
        super(`${stage}: ${kind}`);
        this.name = 'MatchFailure';
    }
}
export type MatchFailureFacts = { kind: string; stage: string; source?: string; httpStatus?: number; upstreamCode?: number; proxyPhase?: string; upstreamHttpStatus?: number; retryAfterMs?: number };
export const matchFailureFacts = (error: unknown): MatchFailureFacts => {
    const value = error as { name?: string; kind?: string; stage?: string; source?: string; providerId?: string; code?: string; summary?: { httpStatus?: number; requestCode?: number; topCode?: number; proxyPhase?: string; upstreamHttpStatus?: number; retryAfterMs?: number }; status?: number; httpStatus?: number; proxyPhase?: string; upstreamHttpStatus?: number; retryAfterMs?: number; cause?: { httpStatus?: number; code?: number } } | null;
    const httpStatus = value?.summary?.httpStatus ?? value?.status ?? value?.httpStatus ?? value?.cause?.httpStatus;
    const upstreamCode = value?.summary?.requestCode || value?.summary?.topCode || value?.cause?.code;
    return { kind: value?.name === 'AbortError' ? 'cancelled' : value?.name === 'TimeoutError' || value?.name === 'OnlineRequestTimeout' ? 'timeout' : value?.kind || (value?.name === 'SyntaxError' ? 'invalid-response' : httpStatus && httpStatus !== 200 ? 'http' : value?.code === 'auth-required' || upstreamCode ? 'upstream' : value?.code || (httpStatus === 200 ? 'invalid-response' : 'network')),
        stage: value?.stage || 'search', source: value?.source || value?.providerId,
        httpStatus, upstreamCode, proxyPhase: value?.summary?.proxyPhase ?? value?.proxyPhase,
        upstreamHttpStatus: value?.summary?.upstreamHttpStatus ?? value?.upstreamHttpStatus,
        retryAfterMs: value?.summary?.retryAfterMs ?? value?.retryAfterMs };
};
type Entry = Partial<MatchFailureFacts> & { time: string; stage: string; source?: string; outcome?: string; count?: number; kind?: string; httpStatus?: number; upstreamCode?: number };
let entries: Entry[] = [];
const listeners = new Set<() => void>();
export const matchingDebugEnabled = () => typeof window !== 'undefined' && new URLSearchParams(window.location?.search || '').get('matchDebug') === '1';
export const getMatchingDiagnostics = () => entries;
export const subscribeMatchingDiagnostics = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const recordMatchDiagnostic = (event: { stage: string; source?: string; outcome?: string; count?: number; error?: unknown }) => {
    if (!matchingDebugEnabled()) return;
    const { error, ...safe } = event;
    entries = [...entries, { time: new Date().toISOString(), ...(error ? matchFailureFacts(error) : {}), ...safe }].slice(-60);
    listeners.forEach(listener => { try { listener(); } catch { /* Observation cannot fail matching. */ } });
};

// Last completed batch summary survives the event ring but remains memory-only and contains no song names.
let batchSummary: unknown = null;
export const getMatchBatchSummary = () => batchSummary;
export const recordMatchBatchSummary = (summary: unknown) => {
    if (!matchingDebugEnabled()) return;
    batchSummary = summary;
    recordMatchDiagnostic({ stage: 'batch', outcome: 'complete' });
};
