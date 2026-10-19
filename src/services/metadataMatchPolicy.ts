import type { OnlineMetadataCandidate, OnlineMetadataSearchTarget } from './onlineMetadataSearchService';
import { calculateMatchScoreDetails, normalizeLyricMatchText, normalizeTitleForMatch } from '../utils/lyrics/matchScore';

// Automatic metadata and artwork need identity evidence; manual search keeps every candidate visible.
const versionFlags = (title: string) => {
    const text = normalizeLyricMatchText(title);
    return [/(?:\blive\b|现场|現場|演唱会|演唱會)/i, /(?:instrumental|karaoke|off\s*vocal|伴奏|纯音乐|純音樂)/i,
        /(?:remix|\bmix\b|リミックス)/i, /(?:cover|翻唱)/i, /(?:remaster|重制|重製)/i]
        .map(pattern => pattern.test(text));
};

export const isAutomaticMetadataCandidateReliable = (
    target: OnlineMetadataSearchTarget,
    candidate: OnlineMetadataCandidate,
    intent: 'metadata' | 'cover' = 'metadata',
): boolean => {
    const details = calculateMatchScoreDetails(target, candidate.raw);
    if (details.titleSimilarity < 0.9 || normalizeTitleForMatch(target.title).replace(/\s/g, '') !== normalizeTitleForMatch(candidate.title).replace(/\s/g, '')) return false;
    if (versionFlags(target.title).some((flag, index) => flag !== versionFlags(candidate.title)[index])) return false;
    const hasArtist = Boolean(target.artist.trim());
    const hasAlbum = Boolean(target.album?.trim());
    if (hasArtist && details.artistSimilarity < 0.8) return false;
    // Artwork is release-specific when the library already knows its album.
    if (intent === 'cover' && hasAlbum && details.albumMatched !== true) return false;
    const durationKnown = target.durationMs > 0 && candidate.durationMs > 0;
    const durationClose = durationKnown && Math.abs(target.durationMs - candidate.durationMs) <= 3000;
    if (durationKnown && Math.abs(target.durationMs - candidate.durationMs) > 5000) return false;
    if (!hasArtist && !(details.albumMatched === true && durationClose)) return false;
    // Missing release data needs duration evidence; a conflicting known album is never applied automatically.
    if (hasAlbum && details.albumMatched === false) return false;
    if (hasAlbum && details.albumMatched === null && !durationClose) return false;
    return hasArtist || hasAlbum;
};
