import type { LyricSourceAccess } from '../../../utils/lyrics/lyricMatchSources';
import { fetchQQLyrics, searchQQLyrics } from './qqLyricProvider';
import { getQqSearchDiagnostics, qqSearchDebugEnabled, subscribeQqSearchDiagnostics } from './qqLyricSearchStatus';

// QQ's search has only ever been asked for one page of 20 songs at most.
const QQ_SEARCH_PAGE_MAX = 20;

// QQ's lyrics are read from QQ's own lyric service, which needs no QQ account and knows a
// song by its mid.
// QQ's matching path remains anonymous and independent of the ordinary signed-in song search.
export const qqLyricMatchAccess: Partial<LyricSourceAccess> = {
    handlesQueryFallback: true,
    search: (query, limit, _target, signal, accept) => accept ? searchQQLyrics(query, 1, Math.min(limit, QQ_SEARCH_PAGE_MAX), signal, accept) : signal ? searchQQLyrics(query, 1, Math.min(limit, QQ_SEARCH_PAGE_MAX), signal) : searchQQLyrics(query, 1, Math.min(limit, QQ_SEARCH_PAGE_MAX)),
    fetch: async (song, lent) => ({ lyrics: await fetchQQLyrics(song, lent) ?? null, isPureMusic: false }),
    songKey: song => String(song.qqMid ?? song.id),
    marksChorusOnFetch: true,
    diagnostics: {
        enabled: qqSearchDebugEnabled, subscribe: subscribeQqSearchDiagnostics, getSnapshot: getQqSearchDiagnostics,
        titleKey: 'qqLyricSearch.diagnostics', hintKey: 'qqLyricSearch.hint', copyKey: 'qqLyricSearch.copy', selectKey: 'qqLyricSearch.select',
    },
};
