import { LyricSearchFailure } from '../../../utils/lyrics/lyricSearchFailure';
import { useEffect, useRef, useState } from 'react';
import type { LyricProviderSource, SongResult } from '../../../types';
import { useLyricMatchSources } from '../../../hooks/useLyricMatchSources';
import { searchLyricsByMatchSource, type LyricMatchSearchTarget } from '../../../utils/lyrics/lyricMatchSources';
import { LYRIC_SOURCES } from '../../../utils/lyrics/lyricSources';
import type { LyricMatchSource } from '../../../utils/lyrics/matchResult';
import { buildLyricSearchQuery } from '../../../utils/lyrics/searchQuery';

// src/components/modal/lyric-match/useLyricMatchSearch.ts
// The search of the lyric match window: the source it is on, the text in the search box, the
// results and the chosen one. A kind of song says what the song is called and, if it wants,
// which result is chosen when a search answers.

/** What the song being matched is called: the first search text is made of it, and results are scored against it. */
export type LyricMatchSongInfo = Required<LyricMatchSearchTarget>;

export interface LyricMatchSearchOptions {
    /** The result chosen when a search answers. Without it none is: the person chooses. */
    pickResult?: (results: SongResult[]) => SongResult | null;
    /**
     * True: on another source the search box goes back to the song's own text. Otherwise the text
     * the person typed is searched on the new source too.
     */
    resetsQueryOnSourceChange?: boolean;
    /** When a local-only browser prefers an independently accessible lyric source. */
    initialSource?: LyricProviderSource;
    /** Search both public lyric databases for a local iPad song, preferring AMLL. */
    autoPublicSources?: boolean;
}

// The source the window is on, with the sources it offers: it opens on the first one. An account
// can be signed out under the open window: its tab goes, and the window is then on the first
// source that is left.
const useLyricMatchSourceChoice = (initialSource?: LyricProviderSource): [LyricProviderSource, (source: LyricProviderSource) => void, LyricProviderSource[]] => {
    const offered = useLyricMatchSources();
    const [chosen, setChosen] = useState<LyricProviderSource>(initialSource ?? LYRIC_SOURCES[0].id);
    return [offered.includes(chosen) ? chosen : offered[0], setChosen, offered];
};

export const useLyricMatchSearch = (
    song: unknown,
    songInfo: LyricMatchSongInfo,
    { pickResult, resetsQueryOnSourceChange, initialSource, autoPublicSources = false }: LyricMatchSearchOptions = {},
) => {
    const [source, setSource, sources] = useLyricMatchSourceChoice(initialSource);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SongResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState(false);
    const [searchFailureMessageKey, setSearchFailureMessageKey] = useState<string | null>(null);
    const [selectedResult, setSelectedResult] = useState<SongResult | null>(null);
    const requestIdRef = useRef(0);
    const searchedSourceRef = useRef(source);

    const songQuery = buildLyricSearchQuery(songInfo.title, songInfo.artist, songInfo.album);

    // Every source is searched by the text in the box. An answer that a later search has overtaken
    // is dropped. `anew`: the song or the tab changed, so what
    // the search before found is not this one's and goes even when there is nothing to search.
    const runSearch = async (typed: string, activeSource: LyricMatchSource, anew = false) => {
        const text = typed.trim();
        if (!text) {
            if (anew) {
                requestIdRef.current += 1;
                setIsSearching(false);
                setResults([]);
                setSelectedResult(null);
                setSearchError(false);
                setSearchFailureMessageKey(null);
            }
            return;
        }

        const requestId = ++requestIdRef.current;
        setIsSearching(true);
        setResults([]);
        setSelectedResult(null);
        setSearchError(false);
        setSearchFailureMessageKey(null);

        try {
            let found: SongResult[];
            let resultSource = activeSource;
            if (autoPublicSources && activeSource === 'amll') {
                // One tap instead of manually switching sources and retyping the
                // same song. Parallel lookup bounds latency to the slower public
                // service rather than the sum of both providers' timeouts.
                type PublicResult = { source: 'amll' | 'lrclib'; songs: SongResult[]; failed: boolean };
                const lookup = (lookupSource: 'amll' | 'lrclib'): Promise<PublicResult> => (
                    searchLyricsByMatchSource(lookupSource, text, songInfo)
                        .then(songs => ({ source: lookupSource, songs, failed: false }),
                            () => ({ source: lookupSource, songs: [], failed: true }))
                );
                const amll = lookup('amll');
                const lrclib = lookup('lrclib');
                const first = await Promise.race([amll, lrclib]);
                let picked: PublicResult;
                if (first.source === 'amll' && first.songs.length) {
                    picked = first; // high-quality per-word TTML, no delay
                } else if (first.source === 'lrclib' && first.songs.length) {
                    // Use already-found synced lyrics promptly instead of waiting
                    // for AMLL's full timeout. Give AMLL a brief grace window to
                    // win with superior word-by-word timing when it's responsive.
                    const gracefulAmll = await Promise.race([
                        amll,
                        new Promise<null>(resolve => window.setTimeout(() => resolve(null), 900)),
                    ]);
                    picked = gracefulAmll?.songs.length ? gracefulAmll : first;
                } else {
                    picked = first.source === 'amll' ? await lrclib : await amll;
                    if (!picked.songs.length && first.failed && picked.failed) {
                        throw new Error('AMLL and LRCLIB are both unavailable');
                    }
                }
                found = picked.songs;
                if (found.length) resultSource = picked.source;
            } else {
                found = await searchLyricsByMatchSource(activeSource, text, songInfo);
            }
            if (requestId !== requestIdRef.current) return;

            if (resultSource !== activeSource) {
                // Skip the usual source-change search: these results are already
                // from the new provider, so no duplicate request is necessary.
                searchedSourceRef.current = resultSource;
                setSource(resultSource);
            }
            setResults(found);
            setSelectedResult(pickResult?.(found) ?? null);
        } catch (error) {
            console.error('[LyricMatch] Search failed:', error);
            if (requestId === requestIdRef.current) {
                setSearchError(true);
                setSearchFailureMessageKey(error instanceof LyricSearchFailure ? error.searchFailureMessageKey : null);
            }
        } finally {
            if (requestId === requestIdRef.current) {
                setIsSearching(false);
            }
        }
    };

    // A song starts from its own search text.
    useEffect(() => {
        setQuery(songQuery);
        void runSearch(songQuery, source, true);
    }, [song]);

    useEffect(() => {
        if (searchedSourceRef.current === source) return;
        searchedSourceRef.current = source;
        if (resetsQueryOnSourceChange) {
            setQuery(songQuery);
            void runSearch(songQuery, source, true);
        } else {
            void runSearch(query, source, true);
        }
    }, [source]);

    return {
        songInfo,
        source,
        setSource,
        sources,
        query,
        setQuery,
        results,
        isSearching,
        searchError,
        searchFailureMessageKey,
        selectedResult,
        setSelectedResult,
        /** Searches the text in the box on the source the window is on. */
        submit: () => runSearch(query, source),
    };
};

export type LyricMatchSearch = ReturnType<typeof useLyricMatchSearch>;
