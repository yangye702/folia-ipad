import type { LocalSong, LyricProviderSource, SongResult } from '../types';
import type { LocalSongMetadataSource } from '../types/localLibrary';
import { getProviderSongMetadata } from './onlineMusic/songMetadata';
import { searchMatchingSource, getLyricSourceAccess } from '../utils/lyrics/lyricMatchSources';
import { isAutomaticMetadataCandidateReliable } from './metadataMatchPolicy';
import { recordMatchDiagnostic, MatchFailure } from './matchingDiagnostics';
import { calculateMatchScoreDetails } from '../utils/lyrics/matchScore';
import { MatchingSearchSession } from './matchingSearchSession';
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
    incompleteSearchError?: unknown;
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

export async function searchOnlineMetadata(
    source: OnlineMetadataSource,
    query: string,
    target: OnlineMetadataSearchTarget,
    options: { limit?: number; signal?: AbortSignal; session?: MatchingSearchSession; accept?: (songs: SongResult[]) => boolean } = {},
): Promise<OnlineMetadataCandidate[]> {
    const safeQuery = query.trim();
    if (!safeQuery) return [];
    throwIfAborted(options.signal);
    const limit = options.limit ?? 10;
    let results: SongResult[];
    try {
        results = await searchMatchingSource(source, safeQuery, limit, target, { ...options, session: options.session ?? new MatchingSearchSession() });
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
    options: { intent?: 'metadata' | 'cover'; excludedCoverUrls?: string[]; session?: MatchingSearchSession } = {},
): Promise<OnlineMetadataCandidate | null> {
    const target = buildLocalSongMetadataSearchTarget(song);
    const query = buildLocalSongMetadataSearchQuery(song);
    const session = options.session ?? new MatchingSearchSession();
    const errors: unknown[] = [];
    const failedSources: string[] = [];
    let hadCandidates = false;
    let fallback: OnlineMetadataCandidate | null = null;
    for (const source of ['netease', 'qq', 'kugou'] as const) {
        throwIfAborted(signal);
        try {
            const queries = getLyricSourceAccess(source).handlesQueryFallback ? [query] : [...new Set([
                query, buildLyricSearchQuery(target.title, target.artist), buildLyricSearchQuery(target.title),
            ].filter(Boolean))];
            // Broaden only successful but insufficient searches, never a refused/broken endpoint.
            for (const variant of queries) {
                const candidates = await searchOnlineMetadata(source, variant, target, { limit: 20, signal, session,
                    accept: results => results.some(result => {
                        const candidate = normalizeOnlineMetadataCandidate(source, result, target);
                        return isAutomaticMetadataCandidateReliable(target, candidate, options.intent)
                            && (options.intent !== 'cover' || Boolean(candidate.coverUrl && !options.excludedCoverUrls?.includes(candidate.coverUrl)));
                    }),
                });
                hadCandidates ||= candidates.length > 0;
                const reliable = candidates.filter(candidate => isAutomaticMetadataCandidateReliable(target, candidate, options.intent));
                if (options.intent === 'cover') {
                    const withCover = reliable.find(candidate => candidate.coverUrl && !options.excludedCoverUrls?.includes(candidate.coverUrl));
                    if (withCover) return withCover;
                } else if (reliable.length) {
                    const withCover = reliable.find(candidate => candidate.coverUrl && isAutomaticMetadataCandidateReliable(target, candidate, 'cover'));
                    if (withCover) return withCover;
                    // Artwork from a different release must not leak through a metadata-only fallback.
                    fallback ??= { ...reliable[0], coverUrl: undefined };
                }
                // Reliable identity with no picture is a reason to try another source, not broaden the same query.
                if (reliable.length) break;
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') throw error;
            errors.push(error);
            failedSources.push(source);
        }
    }
    if (fallback) return errors.length ? { ...fallback, incompleteSearchError: new MatchFailure('partial-search-failure', 'search', failedSources.join(', '), errors) } : fallback;
    if (errors.length) throw new MatchFailure('partial-search-failure', 'search', failedSources.join(', '), errors);
    if (hadCandidates) throw new MatchFailure('low-confidence', 'candidate');
    return null;
}
