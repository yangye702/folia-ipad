// Bounded opt-in matching evidence. Only whitelisted scalar facts leave the error boundary.
export class MatchFailure extends Error {
    constructor(public readonly kind: string, public readonly stage: string, public readonly source?: string, public readonly causes?: unknown[]) {
        super(`${stage}: ${kind}`);
        this.name = 'MatchFailure';
    }
}
export const matchFailureFacts = (error: unknown): { kind: string; stage: string; source?: string; httpStatus?: number; upstreamCode?: number } => {
    const value = error as { name?: string; kind?: string; stage?: string; source?: string; providerId?: string; code?: string; summary?: { httpStatus?: number; requestCode?: number }; status?: number; httpStatus?: number; cause?: { httpStatus?: number; code?: number } } | null;
    const httpStatus = value?.summary?.httpStatus ?? value?.status ?? value?.httpStatus ?? value?.cause?.httpStatus;
    return { kind: value?.name === 'AbortError' ? 'cancelled' : value?.name === 'TimeoutError' || value?.name === 'OnlineRequestTimeout' ? 'timeout' : value?.kind || (value?.name === 'SyntaxError' || httpStatus === 200 ? 'invalid-response' : httpStatus ? 'http' : value?.code === 'auth-required' || value?.cause?.code ? 'upstream' : value?.code || 'network'),
        stage: value?.stage || 'search', source: value?.source || value?.providerId,
        httpStatus, upstreamCode: value?.summary?.requestCode ?? value?.cause?.code };
};
type Entry = { time: string; stage: string; source?: string; outcome?: string; count?: number; kind?: string; httpStatus?: number; upstreamCode?: number };
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
