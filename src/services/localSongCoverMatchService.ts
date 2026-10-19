import type { LocalSong } from '../types';
import { hasLocalSongCover } from '../utils/localSongCover';
import { getCachedCoverUrl } from './coverCache';
import { findAutomaticOnlineMetadataCandidate } from './onlineMetadataSearchService';
import { applyLocalSongMatchSelection } from './localSongMatchSelectionService';
import type { MatchingSearchSession } from './matchingSearchSession';
import { recordMatchDiagnostic } from './matchingDiagnostics';

// Cover repair is independent of lyrics and identity assignments; share the existing provider search.
const pending = new Map<string, { work: Promise<boolean>; signal?: AbortSignal }>();
export const needsLocalSongCoverMatch = async (song: LocalSong): Promise<boolean> => {
    if (song.noAutoMatch || song.markedPureMusic || hasLocalSongCover(song)) return false;
    if (song.onlineMetadata?.coverUrl) {
        const cached = await getCachedCoverUrl(`cover_local_${song.id}`, song.onlineMetadata.coverUrl);
        if (cached) { URL.revokeObjectURL(cached); return false; }
    }
    return true;
};
export const completeLocalSongCover = (song: LocalSong, signal?: AbortSignal, session?: MatchingSearchSession): Promise<boolean> => {
    const existing = pending.get(song.id);
    if (existing && !existing.signal?.aborted) return existing.work;
    const work = (async () => {
        signal?.throwIfAborted();
        if (!await needsLocalSongCoverMatch(song)) return false;
        if (song.onlineMetadata?.coverUrl) {
            // Restoring a saved URL still needs the same fresh-row guards as a newly found image.
            const metadata = song.onlineMetadata;
            const restored = await applyLocalSongMatchSelection({
                songId: song.id, metadata: 'keep', cover: 'online', lyrics: 'keep', matchMode: 'automatic', signal,
                expectedCoverUrl: metadata.coverUrl,
                candidate: { source: metadata.source, songId: metadata.songId ?? song.id, title: song.title,
                    artists: metadata.artists, album: metadata.album, coverUrl: metadata.coverUrl, durationMs: song.duration,
                    score: 0, titleMatched: false, durationMatched: null,
                    raw: { id: 0, name: song.title, artists: [], album: { id: 0, name: '' }, durationMs: song.duration } },
            });
            if (restored.coverCached) return true;
        }
        signal?.throwIfAborted();
        const candidate = await findAutomaticOnlineMetadataCandidate(song, signal, { intent: 'cover', session, excludedCoverUrls: song.onlineMetadata?.coverUrl ? [song.onlineMetadata.coverUrl] : [] });
        signal?.throwIfAborted();
        if (!candidate) return false;
        const result = await applyLocalSongMatchSelection({ songId: song.id, candidate, metadata: 'keep', cover: 'online', lyrics: 'keep', matchMode: 'automatic', signal, expectedCoverUrl: song.onlineMetadata?.coverUrl || null });
        recordMatchDiagnostic({ stage: 'cover', source: candidate.source, outcome: result.coverCached ? 'success' : 'failed' });
        if (!result.coverCached && result.coverError) throw Object.assign(new Error('Cover incomplete'), result.coverError);
        return result.coverCached;
    })().finally(() => { if (pending.get(song.id)?.work === work) pending.delete(song.id); });
    pending.set(song.id, { work, signal });
    return work;
};
