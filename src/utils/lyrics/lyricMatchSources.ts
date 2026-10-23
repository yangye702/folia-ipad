import { getOnlineMusicProvider } from '../../services/onlineMusic/providerRegistry';
import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';
import type { AmllDbPlatform, LyricData, LyricProviderSource, SongResult } from '../../types';
import type { ChorusRange, ProviderLyricsResult } from '../../types/onlineMusic';
import { calculateMatchScore } from './matchScore';
import { defaultMatchingSearchSession, type MatchingSearchSession } from '../../services/matchingSearchSession';
import { qqLyricMatchAccess } from '../../services/onlineMusic/qq/qqLyricMatchAccess';
import type { LyricSearchDiagnostics } from '../../types/lyricSearchDiagnostics';
import { fetchAmllDbLyrics, getAmllDbMusicIds, searchAmllDbSongs } from './providers/amllDbProvider';
import { buildAmllDbSearchQueries, toAmllDbSongResults } from './amllDbCandidates';
import { applyChorusRangesByTime } from './chorusEffects';
import { hasRenderableLyrics } from './validity';
import { LYRIC_SOURCE_IDS, getLyricSource } from './lyricSources';
import { searchLrclibLyrics, fetchLrclibLyrics } from './providers/lrclibProvider';

// src/utils/lyrics/lyricMatchSources.ts
// How each lyric source of lyricSources.ts is searched and fetched: for the match windows, for
// the automatic pick and for the metadata search.

const AMLL_DB_SEARCH_PAGE_SIZE = 50;
const AMLL_DB_MAX_RESULTS = 20;
const MATCH_WINDOW_SEARCH_LIMIT = 50;

export type LyricMatchSearchTarget = {
    title: string;
    artist: string;
    durationMs: number;
    album?: string;
};

export type LyricMatchFetchResult = {
    lyrics: LyricData | null;
    isPureMusic: boolean;
    matchedLyricsProviderPlatform?: AmllDbPlatform;
};

// What a source gives for one song. A lyric from AMLL DB names the platform it was kept under.
export type LyricSourceLyrics = ProviderLyricsResult & { matchedLyricsProviderPlatform?: AmllDbPlatform };

export interface LyricSourceAccess {
    /** The adapter already performs its bounded query fallback or a title-only search. */
    handlesQueryFallback?: boolean;
    diagnostics?: LyricSearchDiagnostics;
    /**
     * The source's songs for `query`, `limit` of them at most. `target` is the song being matched,
     * for a source that has to choose its candidates itself.
     */
    search(query: string, limit: number, target: LyricMatchSearchTarget, signal?: AbortSignal, accept?: (songs: SongResult[]) => boolean): Promise<SongResult[]>;
    /**
     * The lyrics of one of the source's songs, or null when the source cannot be asked.
     * `lent.chorusRanges` are chorus ranges found elsewhere, for a fetch that marks the chorus itself.
     */
    fetch(song: SongResult, lent: { chorusRanges: ChorusRange[] }): Promise<LyricSourceLyrics | null>;
    /** What the source knows a song by, as text: two songs with one key are the same song there. */
    songKey(song: Pick<SongResult, 'id' | 'qqMid' | 'kgHash'>): string;
    /**
     * Set when a song's id alone is enough to fetch its lyrics: gives the id to fetch with, or
     * null when `songId` cannot be one of the source's. Without it, a song picked for the source
     * is looked for among the source's search results.
     */
    knownById?(songId: number | string): number | string | null;
    /** True when the chorus ranges it gives are kept, to be lent to a fetch that marks the chorus itself. */
    sharesChorusRanges?: boolean;
    /** True when its fetch has marked the chorus already, from the ranges lent to it or from its own text. */
    marksChorusOnFetch?: boolean;
}

// A source that needs an account is a source only while one is signed in.
export const isLyricMatchSourceOffered = (source: LyricProviderSource): boolean => (
    !getLyricSource(source).needsAccount || Boolean(useOnlineProviderAccountStore.getState().accounts[source]?.user)
);

const sortByMatchScore = (songs: SongResult[], target: LyricMatchSearchTarget) => (
    [...songs].sort((a, b) => calculateMatchScore(target, b) - calculateMatchScore(target, a))
);

const hasChorusMarkers = (lyrics: LyricData | null): boolean => (
    Boolean(lyrics?.lines.some(line => line.isChorus))
);

// AMLL 官方搜索直接返回已收录的歌曲，不用再先搜网易云 / QQ 后逐个探测（#515）。
// 按 buildAmllDbSearchQueries 的顺序搜，有结果就停；请求失败（限流、网络错误）时直接停止，不再发兜底请求。
export async function searchAmllDbLyricCandidates(
    query: string,
    target: LyricMatchSearchTarget,
): Promise<SongResult[]> {
    const queries = buildAmllDbSearchQueries(query);
    // Respect the relevance ordering: specific title+artist, title alone, then
    // the broad lyric-body text query. Script variants inside each group run
    // concurrently so 簡/简 does not add a second 5-second wait.
    const paired = queries.filter(q => 'musicName' in q && Boolean(q.artistName));
    const titleOnly = queries.filter(q => 'musicName' in q && !q.artistName);
    const broad = queries.filter(q => 'q' in q);
    let hadSuccessfulRequest = false;
    let lastFailure: unknown = null;
    for (const group of [paired, titleOnly, broad]) {
        if (!group.length) continue;
        const settled = await Promise.allSettled(group.map(params => searchAmllDbSongs(params, AMLL_DB_SEARCH_PAGE_SIZE)));
        const candidates: SongResult[] = [];
        let groupHasSuccess = false;
        for (const response of settled) {
            if (response.status === 'fulfilled' && response.value !== null) {
                hadSuccessfulRequest = true;
                groupHasSuccess = true;
                candidates.push(...toAmllDbSongResults(response.value));
            } else {
                lastFailure = response.status === 'rejected' ? response.reason : new Error('AMLL service unavailable');
            }
        }
        // A failed service call is not an empty catalog: do not issue further
        // broad fallback requests when every query in this group was unreachable.
        if (!groupHasSuccess) throw lastFailure ?? new Error('AMLL service unavailable');
        if (candidates.length) {
            const ids = new Set<string>();
            const distinct = candidates.filter(song => {
                const key = `${song.amllDbPlatform}:${song.id}`;
                if (ids.has(key)) return false;
                ids.add(key);
                return true;
            });
            return sortByMatchScore(distinct, target).slice(0, AMLL_DB_MAX_RESULTS);
        }
    }
    if (!hadSuccessfulRequest) throw lastFailure ?? new Error('AMLL service unavailable');
    return [];
}

// The AMLL DB lyric of a candidate its search gave, with NetEase's chorus ranges when the lyric
// was kept under a NetEase id and marks no chorus itself.
async function fetchAmllDbCandidateLyrics(song: SongResult): Promise<LyricSourceLyrics | null> {
    const platform = song.amllDbPlatform;
    if (!platform) {
        return null;
    }
    const fetchedLyrics = await fetchAmllDbLyrics(platform, getAmllDbMusicIds(platform, song));
    const lyrics = hasRenderableLyrics(fetchedLyrics) ? fetchedLyrics : null;
    const chorusRanges = platform === 'ncm' && !hasChorusMarkers(lyrics)
        ? await getOnlineMusicProvider('netease')?.lyrics?.getChorusRanges?.(song.id) ?? []
        : [];

    return {
        lyrics: lyrics && chorusRanges.length > 0
            ? applyChorusRangesByTime(lyrics, chorusRanges)
            : lyrics,
        isPureMusic: false,
        matchedLyricsProviderPlatform: platform,
    };
}

// A platform source is searched and fetched through the provider registered under its id, and
// knows a song by its id.
const platformAccess = (providerId: LyricProviderSource): LyricSourceAccess => ({
    search: async (query, limit) => (await getOnlineMusicProvider(providerId)?.search?.searchSongs(query, limit, 0))?.items ?? [],
    fetch: async song => await getOnlineMusicProvider(providerId)?.lyrics?.getLyrics(song) ?? null,
    songKey: song => String(song.id),
});

// Where a source differs from that. A source with no entry here is reached as its platform alone.
const OWN_ACCESS: Partial<Record<LyricProviderSource, Partial<LyricSourceAccess>>> = {
    netease: {
        knownById: (songId) => {
            const numericId = typeof songId === 'number' ? songId : Number(songId);
            return Number.isSafeInteger(numericId) && numericId > 0 ? numericId : null;
        },
        sharesChorusRanges: true,
    },
    // AMLL DB is searched through its own API, by the words typed like the platforms (#515).
    amll: {
        search: (query, _limit, target) => searchAmllDbLyricCandidates(query, target),
        fetch: song => fetchAmllDbCandidateLyrics(song),
    },
    lrclib: {
        search: (query, limit) => searchLrclibLyrics(query, limit),
        fetch: async song => ({ lyrics: await fetchLrclibLyrics(song), isPureMusic: false }),
    },
    qq: qqLyricMatchAccess,
    kugou: { handlesQueryFallback: true,
        songKey: song => String(song.kgHash ?? song.id).toUpperCase(),
    },
};

const accessBySource = new Map<LyricProviderSource, LyricSourceAccess>(
    LYRIC_SOURCE_IDS.map(source => [source, { ...platformAccess(source), ...OWN_ACCESS[source] }]),
);

export const getLyricSourceAccess = (source: LyricProviderSource): LyricSourceAccess => (
    accessBySource.get(source) as LyricSourceAccess
);

const matchSearchCache = new Map<string, { until: number; value: SongResult[] }>();
const pendingMatchSearches = new Map<string, Promise<SongResult[]>>();
const MAX_MATCH_SEARCH_CACHE = 80;

// Shares the existing source access without caching target-specific scores or applied song state.
export function searchMatchingSource(
    source: LyricProviderSource, query: string, limit: number, target: LyricMatchSearchTarget,
    options: { signal?: AbortSignal; session?: MatchingSearchSession; accept?: (songs: SongResult[]) => boolean } = {},
): Promise<SongResult[]> {
    const session = options.session ?? defaultMatchingSearchSession;
    const account = useOnlineProviderAccountStore.getState().accounts[source];
    const key = JSON.stringify([query.trim().normalize('NFC'), limit, target.title, target.artist, target.album, target.durationMs, Boolean(options.accept), account?.user?.id ?? null, account?.status ?? null]);
    return session.search(source, key, signal => getLyricSourceAccess(source).search(query, limit, target, signal, options.accept), options.signal);
}

export function searchLyricsByMatchSource(
    source: LyricProviderSource,
    query: string,
    target: LyricMatchSearchTarget,
): Promise<SongResult[]> {
    // Platform queries use account-scoped, short-lived matching sessions; lyric databases keep their existing cache.
    if (source !== 'amll' && source !== 'lrclib') {
        return searchMatchingSource(source, query, MATCH_WINDOW_SEARCH_LIMIT, target)
            .then(songs => sortByMatchScore(songs, target));
    }
    const key = JSON.stringify([source, query.trim().normalize('NFC'), target.title, target.artist, target.album, target.durationMs]);
    const cached = matchSearchCache.get(key);
    if (cached && Date.now() < cached.until) return Promise.resolve(cached.value);
    const active = pendingMatchSearches.get(key);
    if (active) return active;
    const task = getLyricSourceAccess(source).search(query, MATCH_WINDOW_SEARCH_LIMIT, target)
        .then(songs => {
            const sorted = sortByMatchScore(songs, target);
            matchSearchCache.set(key, { until: Date.now() + (sorted.length ? 90_000 : 12_000), value: sorted });
            while (matchSearchCache.size > MAX_MATCH_SEARCH_CACHE) {
                const oldest = matchSearchCache.keys().next().value;
                if (oldest === undefined) break;
                matchSearchCache.delete(oldest);
            }
            return sorted;
        })
        .finally(() => { pendingMatchSearches.delete(key); });
    pendingMatchSearches.set(key, task);
    return task;
}

export async function fetchLyricsForMatchSource(
    source: LyricProviderSource,
    selectedResult: SongResult,
): Promise<LyricMatchFetchResult | null> {
    const result = await getLyricSourceAccess(source).fetch(selectedResult, { chorusRanges: [] });
    if (!result) return null;
    return {
        lyrics: hasRenderableLyrics(result.lyrics) ? result.lyrics : null,
        isPureMusic: result.isPureMusic,
        ...(result.matchedLyricsProviderPlatform ? { matchedLyricsProviderPlatform: result.matchedLyricsProviderPlatform } : {}),
    };
}
