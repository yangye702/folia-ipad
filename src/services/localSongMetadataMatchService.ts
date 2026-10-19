import type { LocalSong } from '../types';
import type { LocalLibraryAssignmentOrigin } from '../types/localLibrary';
import { matchFailureFacts, recordMatchDiagnostic } from './matchingDiagnostics';
import { getCachedCoverUrl } from './coverCache';
import { needsLocalSongCoverMatch, completeLocalSongCover } from './localSongCoverMatchService';
import { hasLocalSongCover } from '../utils/localSongCover';
import { applyLocalSongMatchSelection } from './localSongMatchSelectionService';
import {
    findAutomaticOnlineMetadataCandidate,
    type OnlineMetadataCandidate,
} from './onlineMetadataSearchService';

// src/services/localSongMetadataMatchService.ts
// Applies metadata-only matches and orchestrates cancellable two-worker folder batches.

export type LocalSongMetadataMatchStatus = 'matched' | 'matched-cover-failed' | 'matched-cover-missing' | 'no-match' | 'skipped' | 'failed' | 'cancelled' | 'low-confidence';

export interface LocalSongMetadataMatchUpdate {
    songId: string;
    status: LocalSongMetadataMatchStatus;
    candidate?: OnlineMetadataCandidate;
    error?: unknown;
    detail?: ReturnType<typeof matchFailureFacts>;
}

export interface BatchLocalSongMetadataMatchResult {
    updates: LocalSongMetadataMatchUpdate[];
    cancelled: boolean;
}

export interface ApplyOnlineMetadataCandidateOptions {
    mode: 'automatic' | 'manual';
    protectOrigins?: LocalLibraryAssignmentOrigin[];
    useOnlineMetadata?: boolean;
    useOnlineCover?: boolean;
    intent?: 'metadata' | 'cover';
    signal?: AbortSignal;
}

// Stores one provider candidate while allowing metadata and cover display sources to be chosen independently.
export const applyOnlineMetadataCandidate = async (
    song: LocalSong,
    candidate: OnlineMetadataCandidate,
    options: ApplyOnlineMetadataCandidateOptions,
): Promise<{ song?: LocalSong; coverAttempted: boolean; coverCached: boolean; coverError?: ReturnType<typeof matchFailureFacts> }> => {
    const useOnlineMetadata = options.useOnlineMetadata ?? true;
    let coverExists = hasLocalSongCover(song);
    if (!coverExists && song.onlineMetadata?.coverUrl) {
        const url = await getCachedCoverUrl(`cover_local_${song.id}`, song.onlineMetadata.coverUrl);
        if (url) { URL.revokeObjectURL(url); coverExists = true; }
    }
    const useOnlineCover = Boolean(candidate.coverUrl && (options.mode === 'manual' ? options.useOnlineCover : !coverExists));
    const result = await applyLocalSongMatchSelection({
        songId: song.id,
        candidate,
        metadata: options.intent === 'cover' || !useOnlineMetadata ? 'keep' : 'online',
        cover: useOnlineCover ? 'online' : options.mode === 'manual' ? 'embedded' : 'keep',
        lyrics: 'keep',
        setNoAutoMatch: options.mode === 'manual' && (useOnlineMetadata || useOnlineCover) ? false : undefined,
        matchMode: options.mode,
        protectOrigins: options.protectOrigins,
        signal: options.signal,
        ...(options.mode === 'automatic' ? { expectedCoverUrl: song.onlineMetadata?.coverUrl || null } : {}),
    });
    return { coverAttempted: result.coverAttempted, coverCached: result.coverCached, ...(result.coverError ? { coverError: result.coverError } : {}) };
};

// Restores the complete imported snapshot and keeps future automatic matching from replacing it.
export const useImportedSnapshotForLocalSong = async (songId: string): Promise<void> => {
    await applyLocalSongMatchSelection({
        songId,
        metadata: 'imported',
        cover: 'embedded',
        lyrics: 'automatic',
        setNoAutoMatch: true,
    });
};

let activeBatch: AbortController | null = null;

// Processes at most two songs concurrently and reports every completed item immediately.
export async function batchAutoMatchLocalSongMetadata(
    songs: LocalSong[],
    options: {
        signal?: AbortSignal;
        onUpdate?: (update: LocalSongMetadataMatchUpdate) => void;
        concurrency?: number;
    } = {},
): Promise<BatchLocalSongMetadataMatchResult> {
    activeBatch?.abort();
    const controller = new AbortController();
    activeBatch = controller;
    const externalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', externalAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const signal = controller.signal;
    const updates: LocalSongMetadataMatchUpdate[] = [];
    let nextIndex = 0;
    const record = (update: LocalSongMetadataMatchUpdate) => {
        updates.push(update);
        options.onUpdate?.(update);
    };
    const worker = async () => {
        while (nextIndex < songs.length && !signal.aborted) {
            const song = songs[nextIndex++];
            if (song.noAutoMatch || song.markedPureMusic) {
                record({ songId: song.id, status: 'skipped' });
                continue;
            }
            try {
                const intent = song.onlineMetadata?.songId != null || ['manual', 'manual-match', 'split'].includes(song.titleOrigin) ? 'cover' : 'metadata';
                if (intent === 'cover' && !await needsLocalSongCoverMatch(song)) { record({ songId: song.id, status: 'skipped' }); continue; }
                if (intent === 'cover' && song.onlineMetadata?.coverUrl) {
                    const completed = await completeLocalSongCover(song, signal);
                    signal.throwIfAborted();
                    record({ songId: song.id, status: completed ? 'matched' : 'matched-cover-failed' });
                    continue;
                }
                const candidate = await findAutomaticOnlineMetadataCandidate(song, signal, { intent });
                if (signal.aborted) return;
                if (!candidate) {
                    record({ songId: song.id, status: 'no-match' });
                    continue;
                }
                const applied = await applyOnlineMetadataCandidate(song, candidate, {
                    mode: 'automatic',
                    intent,
                    signal,
                    protectOrigins: ['manual', 'manual-match', 'split'],
                });
                record({
                    songId: song.id,
                    status: applied.coverAttempted && !applied.coverCached ? 'matched-cover-failed' : !candidate.coverUrl && !hasLocalSongCover(song) ? 'matched-cover-missing' : 'matched',
                    detail: applied.coverError,
                    candidate,
                });
            } catch (error) {
                const detail = matchFailureFacts(error);
                if (signal.aborted || detail.kind === 'cancelled') return;
                recordMatchDiagnostic({ stage: detail.stage, error });
                record({ songId: song.id, status: detail.kind === 'protected' ? 'skipped' : detail.kind === 'low-confidence' ? 'low-confidence' : 'failed', error, detail });
            }
        }
    };
    const workerCount = Math.max(1, Math.min(options.concurrency ?? 2, 2, songs.length || 1));
    try { await Promise.all(Array.from({ length: workerCount }, () => worker())); }
    finally { options.signal?.removeEventListener('abort', externalAbort); if (activeBatch === controller) activeBatch = null; }
    if (signal.aborted) for (const song of songs) if (!updates.some(update => update.songId === song.id)) record({ songId: song.id, status: 'cancelled' });
    return { updates, cancelled: signal.aborted };
}
