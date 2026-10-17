import type { LyricData, SongResult } from '../../../types';
import { parseLyricsByFormat } from '../parserCore';
import { hasRenderableLyrics } from '../validity';

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

export async function searchLrclibLyrics(query: string, limit: number): Promise<SongResult[]> {
    const parts = query.split(/\s+-\s+/u).map(x => x.trim()).filter(Boolean);
    if (!parts.length) return [];
    const title = parts[0];
    const artist = parts[1]?.split(/\s*[,，、&]\s*/u)[0]?.trim();
    const url = (withArtist: boolean): string => {
        const params = new URLSearchParams({ track_name: title });
        if (withArtist && artist) params.set('artist_name', artist);
        return `${BASE}/api/search?${params}`;
    };
    let records = await request<RecordResult[]>(url(true));
    // Title-only lookup catches incomplete/mis-tagged MP3 artist names.
    if (!records.length && artist) {
        records = await request<RecordResult[]>(url(false));
    }
    // Never offer unsynchronised text as a timed animation.
    return records.filter(record => !record.instrumental && Boolean(record.syncedLyrics?.trim()))
        .slice(0, limit)
        .map(record => {
            cacheLyrics(record.id, record.syncedLyrics);
            return toCandidate(record);
        });
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
