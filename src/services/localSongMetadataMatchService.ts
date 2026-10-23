import type { LocalSong } from '../types';
import type { LocalLibraryAssignmentOrigin } from '../types/localLibrary';
import { matchFailureFacts, recordMatchDiagnostic, recordMatchBatchSummary } from './matchingDiagnostics';
import { MatchingSearchSession, isRetryableMatchFailure } from './matchingSearchSession';
import { appDatabase } from './appDatabase';
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
    attempts?: number;
    detail?: ReturnType<typeof matchFailureFacts>;
}

export interface BatchLocalSongMetadataMatchResult {
    updates: LocalSongMetadataMatchUpdate[];
    cancelled: boolean;
    summary: ReturnType<MatchingSearchSession['snapshot']> & { total: number; elapsedMs: number; recoveryPasses: number; statuses: Record<string, number> };
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
        onProgress?: (phase: 'matching' | 'recovering') => void;
    } = {},
): Promise<BatchLocalSongMetadataMatchResult> {
    activeBatch?.abort();
    const controller = new AbortController();
    activeBatch = controller;
    const externalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', externalAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const signal = controller.signal;
    const session = new MatchingSearchSession(true);
    const startedAt = Date.now();
    const updates: LocalSongMetadataMatchUpdate[] = [];
    const attempts = new Map<string, number>();
    let recoveryPasses = 0;
    const record = (update: LocalSongMetadataMatchUpdate) => {
        updates.push(update);
        options.onUpdate?.(update);
    };
    const attempt = async (song: LocalSong): Promise<LocalSongMetadataMatchUpdate> => {
        if (song.noAutoMatch || song.markedPureMusic) return { songId: song.id, status: 'skipped' };
        try {
            const intent = song.onlineMetadata?.songId != null || ['manual', 'manual-match', 'split'].includes(song.titleOrigin) ? 'cover' : 'metadata';
            if (intent === 'cover' && !await needsLocalSongCoverMatch(song)) return { songId: song.id, status: 'skipped' };
            if (intent === 'cover' && song.onlineMetadata?.coverUrl) {
                const completed = await completeLocalSongCover(song, signal, session);
                signal.throwIfAborted();
                return { songId: song.id, status: completed ? 'matched' : 'matched-cover-failed' };
            }
            const candidate = await findAutomaticOnlineMetadataCandidate(song, signal, { intent, session });
            signal.throwIfAborted();
            if (!candidate) return { songId: song.id, status: 'no-match' };
            const applied = await applyOnlineMetadataCandidate(song, candidate, {
                mode: 'automatic', intent, signal, protectOrigins: ['manual', 'manual-match', 'split'],
            });
            return { songId: song.id,
                status: applied.coverAttempted && !applied.coverCached ? 'matched-cover-failed' : !candidate.coverUrl && !hasLocalSongCover(song) ? 'matched-cover-missing' : 'matched',
                detail: applied.coverError, candidate,
                ...(applied.coverError ? { error: Object.assign(new Error('Cover incomplete'), applied.coverError) }
                    : !candidate.coverUrl && !hasLocalSongCover(song) && candidate.incompleteSearchError ? { error: candidate.incompleteSearchError } : {}),
            };
        } catch (error) {
            const detail = matchFailureFacts(error);
            if (signal.aborted || detail.kind === 'cancelled') throw error;
            recordMatchDiagnostic({ stage: detail.stage, error });
            return { songId: song.id, status: detail.kind === 'protected' ? 'skipped' : detail.kind === 'low-confidence' ? 'low-confidence' : 'failed', error, detail };
        }
    };
    let remaining = [...new Map(songs.map(song => [song.id, song])).values()];
    let deferred: LocalSongMetadataMatchUpdate[] = [];
    try {
        for (let pass = 0; pass < 3 && remaining.length && !signal.aborted; pass++) {
            if (pass) {
                if (!await session.waitForRecovery(signal)) break;
                recoveryPasses++;
            }
            options.onProgress?.(pass ? 'recovering' : 'matching');
            deferred = [];
            let nextIndex = 0;
            const worker = async () => {
                while (nextIndex < remaining.length && !signal.aborted) {
                    const original = remaining[nextIndex++];
                    const count = (attempts.get(original.id) ?? 0) + 1;
                    attempts.set(original.id, count);
                    // Recovery must use committed data, including covers/metadata saved by a partial first attempt.
                    let current: LocalSong | undefined;
                    try { current = pass ? await appDatabase.local_music.get(original.id) : original; }
                    catch { record({ songId: original.id, status: 'failed', detail: { kind: 'local-save', stage: 'read' }, attempts: count }); continue; }
                    if (signal.aborted) return;
                    const update = current ? await attempt(current) : { songId: original.id, status: 'skipped' as const };
                    update.attempts = count;
                    if (signal.aborted) return;
                    if (pass < 2 && update.error && isRetryableMatchFailure(update.error)) deferred.push(update);
                    else record(update);
                }
            };
            const workerCount = Math.max(1, Math.min(options.concurrency ?? 2, 2, remaining.length));
            await Promise.all(Array.from({ length: workerCount }, () => worker()));
            const pendingIds = new Set(deferred.map(update => update.songId));
            remaining = remaining.filter(song => pendingIds.has(song.id));
        }
        if (!signal.aborted) for (const update of deferred) if (!updates.some(item => item.songId === update.songId)) record(update);
    } catch (error) {
        if (!signal.aborted) throw error;
    } finally {
        options.signal?.removeEventListener('abort', externalAbort);
        if (activeBatch === controller) activeBatch = null;
        session.dispose();
    }
    if (signal.aborted) for (const song of songs) if (!updates.some(update => update.songId === song.id)) record({ songId: song.id, status: 'cancelled', attempts: attempts.get(song.id) ?? 0 });
    const statuses: Record<string, number> = {};
    for (const update of updates) statuses[update.status] = (statuses[update.status] ?? 0) + 1;
    const summary = { ...session.snapshot(), total: updates.length, elapsedMs: Date.now() - startedAt, recoveryPasses, statuses };
    recordMatchBatchSummary(summary);
    return { updates, cancelled: signal.aborted, summary };
}
