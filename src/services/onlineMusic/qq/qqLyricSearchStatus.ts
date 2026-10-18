import { LyricSearchFailure } from '../../../utils/lyrics/lyricSearchFailure';
// Safe QQ search failure categories and an opt-in, memory-only diagnostic ring.
export type QqSearchFailureKind = 'network' | 'http' | 'upstream' | 'invalid-response';
export type QqSearchSummary = {
    httpStatus: number | null;
    topCode: number | null;
    requestCode: number | null;
    responseKind: 'unknown' | 'qq-envelope';
    listShape: 'unknown' | 'missing' | 'invalid' | 'array';
    resultCount: number | null;
};
export class QqLyricSearchError extends LyricSearchFailure {
    constructor(public readonly kind: QqSearchFailureKind, public readonly summary: QqSearchSummary) {
        super(kind === 'upstream' ? `QQ Music API error: code ${summary.requestCode || summary.topCode}` : `QQ lyric search failed: ${kind}`, `qqLyricSearch.${kind}`);
        this.name = 'QqLyricSearchError';
    }
}
export const emptyQqSearchSummary = (): QqSearchSummary => ({ httpStatus: null, topCode: null, requestCode: null, responseKind: 'unknown', listShape: 'unknown', resultCount: null });
export async function readQqSearchResponse(response: Response, observe: (summary: QqSearchSummary) => void): Promise<any> {
    const summary = { ...emptyQqSearchSummary(), httpStatus: response.status };
    observe(summary);
    let body: any;
    try { body = await response.json(); }
    catch { observe(summary); throw new QqLyricSearchError(response.ok ? 'invalid-response' : 'http', summary); }
    summary.topCode = typeof body?.code === 'number' ? body.code : null;
    summary.requestCode = typeof body?.request?.code === 'number' ? body.request.code : null;
    if (summary.topCode !== null && summary.requestCode !== null) summary.responseKind = 'qq-envelope';
    const songs = body?.request?.data?.body?.item_song;
    summary.listShape = songs == null ? 'missing' : Array.isArray(songs) ? 'array' : 'invalid';
    summary.resultCount = Array.isArray(songs) ? songs.length : null;
    observe(summary);
    if (!response.ok) throw new QqLyricSearchError('http', summary);
    if (summary.topCode !== null && summary.topCode !== 0 || summary.requestCode !== null && summary.requestCode !== 0) {
        throw new QqLyricSearchError('upstream', summary);
    }
    if (summary.responseKind !== 'qq-envelope' || !Array.isArray(songs) || songs.some((song: any) => (
        !song || typeof song !== 'object' || Array.isArray(song)
        || song.singer != null && (!Array.isArray(song.singer) || song.singer.some((artist: any) => !artist || typeof artist !== 'object'))
    ))) throw new QqLyricSearchError('invalid-response', summary);
    return body.request.data;
}

type Entry = QqSearchSummary & { id: number; time: string; query: string; via: string; outcome: 'pending' | 'success' | QqSearchFailureKind };
let entries: Entry[] = [];
let sequence = 0;
const listeners = new Set<() => void>();
export const qqSearchDebugEnabled = () => {
    try { return typeof window !== 'undefined' && new URLSearchParams(window.location?.search || '').get('qqLyricDebug') === '1'; }
    catch { return false; }
};
export const subscribeQqSearchDiagnostics = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getQqSearchDiagnostics = () => entries;
export function beginQqSearchDiagnostic(query: string, via: string, forLyrics = true) {
    const enabled = forLyrics && qqSearchDebugEnabled();
    const id = enabled ? ++sequence : 0;
    const update = (patch: Partial<Entry>) => {
        if (!enabled) return;
        try {
            entries = entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
            listeners.forEach(listener => { try { listener(); } catch { /* Diagnostic UI must not affect search. */ } });
        } catch { /* Observation only. */ }
    };
    if (enabled) entries = [...entries, { ...emptyQqSearchSummary(), id, time: new Date().toISOString(), query: query.slice(0, 60), via, outcome: 'pending' as const }].slice(-30);
    update({});
    return update;
}
