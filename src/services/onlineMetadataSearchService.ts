import type { LocalSong, LyricProviderSource, SongResult } from '../types';
import type { LocalSongMetadataSource } from '../types/localLibrary';
import { getProviderSongMetadata } from './onlineMusic/songMetadata';
import { getLyricSourceAccess } from '../utils/lyrics/lyricMatchSources';
import { isAutomaticMetadataCandidateReliable } from './metadataMatchPolicy';
import { recordMatchDiagnostic, MatchFailure } from './matchingDiagnostics';
import { calculateMatchScoreDetails } from '../utils/lyrics/matchScore';
import { buildLyricSearchQuery } from '../utils/lyrics/searchQuery';
import {
    getMatchResultAlbumId,
    getMatchResultAlbumName,
    getMatchResultArtistEntities,
    getMatchResultCoverUrl,
} from '../utils/lyrics/matchResult';

// src/services/onlineMetadataSearchService.ts
// Searches song metadata without invoking any lyric provider or lyric download path.

export type OnlineMetadataSource = LocalSongMetadataSource;

export interface OnlineMetadataSearchTarget {
    title: string;
    artist: string;
    album?: string;
    durationMs: number;
}

export interface OnlineMetadataCandidate {
    source: OnlineMetadataSource;
    songId: number | string;
    title: string;
    artists: Array<{ id?: number | string; name: string }>;
    album?: { id?: number | string; name: string };
    coverUrl?: string;
    durationMs: number;
    score: number;
    titleMatched: boolean;
    durationMatched: boolean | null;
    raw: SongResult;
}

const stripAudioExtension = (fileName: string) => fileName.replace(/\.(mp3|flac|m4a|wav|ogg|opus|aac)$/i, '');

export const buildLocalSongMetadataSearchTarget = (song: LocalSong): OnlineMetadataSearchTarget => ({
    title: song.title || stripAudioExtension(song.fileName),
    artist: song.titleOrigin === 'import'
        ? song.importedMetadata.artistNames.join(', ')
        : song.onlineMetadata?.artists.map(artist => artist.name).join(', ') || song.importedMetadata.artistNames.join(', '),
    album: song.titleOrigin === 'import'
        ? song.importedMetadata.albumName || ''
        : song.onlineMetadata?.album?.name || song.importedMetadata.albumName || '',
    durationMs: song.duration || 0,
});

export const buildLocalSongMetadataSearchQuery = (song: LocalSong): string => {
    const target = buildLocalSongMetadataSearchTarget(song);
    return buildLyricSearchQuery(target.title, target.artist, target.album);
};

export const normalizeOnlineMetadataCandidate = (
    source: OnlineMetadataSource,
    result: SongResult,
    target: OnlineMetadataSearchTarget,
): OnlineMetadataCandidate => {
    const details = calculateMatchScoreDetails(target, result);
    const rawAlbumName = getMatchResultAlbumName(result).trim();
    const albumName = /^unknown album$/i.test(rawAlbumName) ? '' : rawAlbumName;
    const albumId = getMatchResultAlbumId(result);
    return {
        source,
        songId: source === 'qq' && result.qqMid
            ? result.qqMid
            : source === 'kugou' && result.kgHash
                ? result.kgHash
                : result.id,
        title: result.name || '',
        artists: getMatchResultArtistEntities(result),
        album: albumName ? { id: albumId, name: albumName } : undefined,
        coverUrl: getMatchResultCoverUrl(result, source) || undefined,
        durationMs: getProviderSongMetadata(result, source).durationMs,
        score: details.score,
        titleMatched: details.titleMatched,
        durationMatched: details.durationMatched,
        raw: result,
    };
};

export const normalizeLyricMatchMetadataCandidate = (
    lyricSource: LyricProviderSource,
    result: SongResult,
    target: OnlineMetadataSearchTarget,
): OnlineMetadataCandidate => {
    // Non-platform lyric databases never have their metadata applied to the local song.
    // Use a platform-shaped candidate only to satisfy the match window's common contract.
    const source: OnlineMetadataSource = lyricSource === 'amll' || lyricSource === 'lrclib'
        ? result.amllDbPlatform === 'qq' ? 'qq' : 'netease'
        : lyricSource;
    return normalizeOnlineMetadataCandidate(source, result, target);
};

const throwIfAborted = (signal?: AbortSignal) => {
    if (!signal?.aborted) return;
    const error = new Error('Metadata matching was cancelled');
    error.name = 'AbortError';
    throw error;
};

// Stops waiting immediately when a provider client cannot receive AbortSignal directly.
const waitForProvider = async <T>(request: Promise<T>, signal?: AbortSignal): Promise<T> => {
    throwIfAborted(signal);
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MatchFailure('timeout', 'search')), 15000);
    });
    const bounded = Promise.race([request, timeout]).finally(() => clearTimeout(timer));
    if (!signal) return await bounded;
    throwIfAborted(signal);
    return await new Promise<T>((resolve, reject) => {
        const abort = () => {
            const error = new Error('Metadata matching was cancelled');
            error.name = signal.reason?.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError';
            reject(error);
        };
        signal.addEventListener('abort', abort, { once: true });
        bounded.then(
            value => {
                signal.removeEventListener('abort', abort);
                resolve(value);
            },
            error => {
                signal.removeEventListener('abort', abort);
                reject(error);
            },
        );
    });
};

// Serialize each source across playback, manual metadata and folder requests, without retrying refusals.
const sourceTails = new Map<string, Promise<void>>();
const runSourceSearch = async <T>(source: string, signal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const previous = sourceTails.get(source) || Promise.resolve();
    const request = previous.then(async () => {
        throwIfAborted(signal);
        const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
        return await waitForProvider(run(boundedSignal), boundedSignal);
    });
    const tail = request.then(() => undefined, () => undefined);
    sourceTails.set(source, tail);
    void tail.then(() => { if (sourceTails.get(source) === tail) sourceTails.delete(source); });
    return await waitForProvider(request, signal);
};

export async function searchOnlineMetadata(
    source: OnlineMetadataSource,
    query: string,
    target: OnlineMetadataSearchTarget,
    options: { limit?: number; signal?: AbortSignal } = {},
): Promise<OnlineMetadataCandidate[]> {
    const safeQuery = query.trim();
    if (!safeQuery) return [];
    throwIfAborted(options.signal);
    const limit = options.limit ?? 10;
    let results: SongResult[];
    try {
        results = await runSourceSearch(source, options.signal, signal => getLyricSourceAccess(source).search(safeQuery, limit, target, signal));
        if (!Array.isArray(results)) throw new MatchFailure('invalid-response', 'search', source);
        recordMatchDiagnostic({ stage: 'search', source, outcome: results.length ? 'success' : 'empty', count: results.length });
    } catch (error) {
        recordMatchDiagnostic({ stage: 'search', source, error });
        throw error;
    }
    throwIfAborted(options.signal);
    return results
        .map(result => normalizeOnlineMetadataCandidate(source, result, target))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
}

// Keeps provider order, but never accepts a title alone or lets a coverless result end a cover search.
export async function findAutomaticOnlineMetadataCandidate(
    song: LocalSong,
    signal?: AbortSignal,
    options: { intent?: 'metadata' | 'cover'; excludedCoverUrls?: string[] } = {},
): Promise<OnlineMetadataCandidate | null> {
    const target = buildLocalSongMetadataSearchTarget(song);
    const query = buildLocalSongMetadataSearchQuery(song);
    const errors: unknown[] = [];
    const failedSources: string[] = [];
    let hadCandidates = false;
    let fallback: OnlineMetadataCandidate | null = null;
    for (const source of ['netease', 'qq', 'kugou'] as const) {
        throwIfAborted(signal);
        try {
            const candidates = await searchOnlineMetadata(source, query, target, { limit: 20, signal });
            hadCandidates ||= candidates.length > 0;
            const reliable = candidates.filter(candidate => isAutomaticMetadataCandidateReliable(target, candidate, options.intent));
            if (options.intent === 'cover') {
                const withCover = reliable.find(candidate => candidate.coverUrl && !options.excludedCoverUrls?.includes(candidate.coverUrl));
                if (withCover) return withCover;
            } else if (reliable.length) {
                const withCover = reliable.find(candidate => candidate.coverUrl && isAutomaticMetadataCandidateReliable(target, candidate, 'cover'));
                if (withCover) return withCover;
                // Metadata may identify the same recording on another release; its artwork must not leak through.
                fallback ??= { ...reliable[0], coverUrl: undefined };
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') throw error;
            errors.push(error);
            failedSources.push(source);
        }
    }
    if (fallback) return fallback;
    if (errors.length) throw new MatchFailure('partial-search-failure', 'search', failedSources.join(', '), errors);
    if (hadCandidates) throw new MatchFailure('low-confidence', 'candidate');
    return null;
}
