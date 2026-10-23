import type { LyricData, SongResult } from '../../../types';
import { parseLyricsByFormat } from '../parserCore';
import { hasRenderableLyrics } from '../validity';
import { lyricChineseVariants } from '../amllDbCandidates';

// LRCLIB is an optional, public synced-LRC fallback for songs AMLL has not indexed.
// A browser fetches metadata/lyrics only; MP3 audio remains on the device.
// API: https://lrclib.net/docs (browser CORS, no key, identify the client).
const BASE = 'https://lrclib.net';
const CLIENT = 'Folia-iPad/0.7.20 (https://github.com/yangye702/folia-ipad)';
// Search replies already include syncedLyrics. Keep a bounded in-memory copy so
// selecting a candidate and previewing it doesn't depend on a second network call.
const lyricCache = new Map<number, string>();
const MAX_CACHE = 100;

function cacheLyrics(id: number, syncedLyrics: string | null): void {
    if (!Number.isSafeInteger(id) || !syncedLyrics?.trim()) return;
    lyricCache.delete(id);
    lyricCache.set(id, syncedLyrics);
    while (lyricCache.size > MAX_CACHE) {
        const oldest = lyricCache.keys().next().value;
        if (oldest === undefined) break;
        lyricCache.delete(oldest);
    }
}

type RecordResult = {
    id: number;
    trackName: string;
    artistName: string;
    albumName: string;
    duration: number;
    instrumental: boolean;
    syncedLyrics: string | null;
};

async function request<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        credentials: 'omit',
        headers: { 'Lrclib-Client': CLIENT },
        signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) {
        throw new Error(`LRCLIB service unavailable (HTTP ${response.status})`);
    }
    return response.json() as Promise<T>;
}

const toCandidate = (record: RecordResult): SongResult => ({
    id: record.id,
    name: record.trackName,
    artists: record.artistName ? [{ id: 0, name: record.artistName }] : [],
    album: { id: 0, name: record.albumName ?? '' },
    durationMs: Math.round((record.duration || 0) * 1000),
});

// Small, browser-local cache: avoids reissuing the same searches when listeners
// switch tabs or retry. No lyrics are uploaded or persisted on a server.
const SEARCH_CACHE_CAP = 60;
const resultsCache = new Map<string, { expires: number; songs: SongResult[] }>();
const inflight = new Map<string, Promise<SongResult[]>>();

async function searchQueryGroup(params: URLSearchParams[]): Promise<RecordResult[]> {
    if (!params.length) return [];
    const outcomes = await Promise.allSettled(params.map(p => request<RecordResult[]>(`${BASE}/api/search?${p}`)));
    const results: RecordResult[] = [];
    let succeeded = false;
    let lastError: unknown = null;
    for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled') {
            succeeded = true;
            results.push(...outcome.value.filter(record => !record.instrumental && Boolean(record.syncedLyrics?.trim())));
        } else {
            lastError = outcome.reason;
        }
    }
    if (!succeeded) throw lastError ?? new Error('LRCLIB search unavailable');
    return results;
}

async function doSearch(query: string, limit: number): Promise<SongResult[]> {
    const parts = query.split(/\s+-\s+/u).map(x => x.trim()).filter(Boolean);
    if (!parts.length) return [];
    const titles = lyricChineseVariants(parts[0]).slice(0, 3);
    const artists = parts[1]
        ? lyricChineseVariants(parts[1].split(/\s*[,，、&]\s*/u)[0] || '').slice(0, 3)
        : [];
    const paramsFor = (withArtist: boolean): URLSearchParams[] => titles.map((title, index) => {
        const params = new URLSearchParams({ track_name: title });
        if (withArtist && artists.length) {
            params.set('artist_name', artists[index] ?? artists[0]);
        }
        return params;
    });
    // In each round the original and Chinese script variant are requested in
    // parallel (not 5-7 seconds apart). Relax artist only after an empty round.
    const grouped = artists.length
        ? [paramsFor(true), paramsFor(false)]
        : [paramsFor(false)];
    const matches: RecordResult[] = [];
    for (const group of grouped) {
        const found = await searchQueryGroup(group);
        if (found.length) {
            matches.push(...found);
            break;
        }
    }
    const seen = new Set<number>();
    const songs: SongResult[] = [];
    for (const record of matches) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        cacheLyrics(record.id, record.syncedLyrics);
        songs.push(toCandidate(record));
        if (songs.length >= limit) break;
    }
    return songs;
}

export function searchLrclibLyrics(query: string, limit: number): Promise<SongResult[]> {
    const key = `${query.trim().normalize('NFC')}:${limit}`;
    const cached = resultsCache.get(key);
    if (cached && Date.now() < cached.expires) return Promise.resolve(cached.songs);
    const running = inflight.get(key);
    if (running) return running;
    const task = doSearch(query, limit).then(songs => {
        resultsCache.set(key, { expires: Date.now() + (songs.length ? 90_000 : 12_000), songs });
        while (resultsCache.size > SEARCH_CACHE_CAP) {
            const oldest = resultsCache.keys().next().value;
            if (oldest === undefined) break;
            resultsCache.delete(oldest);
        }
        return songs;
    }).finally(() => { inflight.delete(key); });
    inflight.set(key, task);
    return task;
}

export async function fetchLrclibLyrics(song: Pick<SongResult, 'id'>): Promise<LyricData | null> {
    const id = Number(song.id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    // The exact matching lyrics are returned by /api/search, so use them first.
    // /api/get/{id} remains a fallback for previously saved selections after reload.
    const cached = lyricCache.get(id);
    const synced = cached ?? (await request<RecordResult>(`${BASE}/api/get/${id}`)).syncedLyrics;
    if (!synced?.trim()) return null;
    cacheLyrics(id, synced);
    const parsed = parseLyricsByFormat('lrc', synced);
    return hasRenderableLyrics(parsed) ? parsed : null;
}
