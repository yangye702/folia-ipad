import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalSong } from '@/types';
import { findAutomaticOnlineMetadataCandidate } from '@/services/onlineMetadataSearchService';
import { applyLocalSongMatchSelection } from '@/services/localSongMatchSelectionService';
import {
    applyOnlineMetadataCandidate,
    batchAutoMatchLocalSongMetadata,
    useImportedSnapshotForLocalSong,
} from '@/services/localSongMetadataMatchService';

// test/unit/localLibrary/localSongMetadataMatchService.test.ts
// Covers shared-command routing, cover policy, cancellation, and the two-worker limit.

vi.mock('@/services/localSongMatchSelectionService', () => ({ applyLocalSongMatchSelection: vi.fn() }));
vi.mock('@/services/onlineMetadataSearchService', () => ({ findAutomaticOnlineMetadataCandidate: vi.fn() }));

const song = (id: string, patch: Partial<LocalSong> = {}): LocalSong => ({
    id,
    fileName: `${id}.flac`,
    filePath: `Library/${id}.flac`,
    title: id,
    titleOrigin: 'import',
    importedMetadata: { title: id, titleSource: 'filename', artistNames: [] },
    duration: 1,
    fileSize: 1,
    mimeType: 'audio/flac',
    addedAt: 1,
    ...patch,
});

const candidate = {
    source: 'qq' as const,
    songId: 'qq-mid',
    title: 'Song',
    artists: [{ name: 'Artist' }],
    album: { id: 'album-id', name: 'Album' },
    coverUrl: 'https://example.test/cover.jpg',
    durationMs: 1,
    score: 90,
    titleMatched: true,
    durationMatched: true,
    raw: {
        id: 1,
        name: 'Song',
        artists: [{ id: 2, name: 'Artist' }],
        album: { id: 3, name: 'Album' },
        durationMs: 1,
    },
};

describe('localSongMetadataMatchService', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(applyLocalSongMatchSelection).mockResolvedValue({
            coverAttempted: true,
            coverCached: true,
            lyricsApplied: true,
            partialLyricsFailure: false,
        });
    });

    it('routes manual metadata and cover selection through the shared command', async () => {
        await applyOnlineMetadataCandidate(song('manual'), candidate, {
            mode: 'manual',
            useOnlineMetadata: true,
            useOnlineCover: true,
        });
        expect(applyLocalSongMatchSelection).toHaveBeenCalledWith({
            songId: 'manual',
            candidate,
            metadata: 'online',
            cover: 'online',
            lyrics: 'keep',
            setNoAutoMatch: false,
            matchMode: 'manual',
            protectOrigins: undefined,
        });
    });

    it('keeps an embedded cover during automatic metadata matching', async () => {
        await applyOnlineMetadataCandidate(song('embedded', { localCoverAssetId: `sha256:${'a'.repeat(64)}` }), candidate, {
            mode: 'automatic',
            protectOrigins: ['manual', 'manual-match', 'split'],
        });
        expect(applyLocalSongMatchSelection).toHaveBeenCalledWith(expect.objectContaining({
            metadata: 'online',
            cover: 'keep',
            setNoAutoMatch: undefined,
            matchMode: 'automatic',
            protectOrigins: ['manual', 'manual-match', 'split'],
        }));
    });

    it('keeps confirmed metadata while allowing an independently selected online cover', async () => {
        await applyOnlineMetadataCandidate(song('cover-only'), candidate, {
            mode: 'manual',
            useOnlineMetadata: false,
            useOnlineCover: true,
        });
        expect(applyLocalSongMatchSelection).toHaveBeenCalledWith(expect.objectContaining({
            metadata: 'keep',
            cover: 'online',
            lyrics: 'keep',
        }));
    });

    it('restores local info and disables future automatic matching', async () => {
        await useImportedSnapshotForLocalSong('local-info');
        expect(applyLocalSongMatchSelection).toHaveBeenCalledWith({
            songId: 'local-info',
            metadata: 'imported',
            cover: 'embedded',
            lyrics: 'automatic',
            setNoAutoMatch: true,
        });
    });

    it('skips noAutoMatch songs and never exceeds two searches', async () => {
        let active = 0;
        let maxActive = 0;
        vi.mocked(findAutomaticOnlineMetadataCandidate).mockImplementation(async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise(resolve => setTimeout(resolve, 5));
            active -= 1;
            return candidate;
        });
        const result = await batchAutoMatchLocalSongMetadata([
            song('skip', { noAutoMatch: true }), song('one'), song('two'), song('three'),
        ]);
        expect(maxActive).toBe(2);
        expect(result.updates.find(update => update.songId === 'skip')?.status).toBe('skipped');
        expect(findAutomaticOnlineMetadataCandidate).toHaveBeenCalledTimes(3);
    });

    it('stops before applying an in-flight result after cancellation', async () => {
        const controller = new AbortController();
        vi.mocked(findAutomaticOnlineMetadataCandidate).mockImplementation(async () => {
            controller.abort();
            return candidate;
        });
        const result = await batchAutoMatchLocalSongMetadata([song('cancelled')], { signal: controller.signal });
        expect(result.cancelled).toBe(true);
        expect(applyLocalSongMatchSelection).not.toHaveBeenCalled();
    });
});

describe('batch lifecycle isolation', () => {
    it('cancels an older batch before a replacement can apply its result', async () => {
        vi.clearAllMocks();
        let release!: (value: typeof candidate) => void;
        vi.mocked(findAutomaticOnlineMetadataCandidate).mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(candidate);
        const first = batchAutoMatchLocalSongMetadata([song('old')]);
        await Promise.resolve();
        const second = batchAutoMatchLocalSongMetadata([song('new')]);
        release(candidate);
        const [a, b] = await Promise.all([first, second]);
        expect(a.cancelled).toBe(true);
        expect(b.cancelled).toBe(false);
        expect(applyLocalSongMatchSelection).not.toHaveBeenCalledWith(expect.objectContaining({ songId: 'old' }));
    });
    it('keeps independent successful results when another song search fails', async () => {
        vi.clearAllMocks();
        vi.mocked(findAutomaticOnlineMetadataCandidate).mockRejectedValueOnce(Object.assign(new Error('fixture refusal'), { kind: 'upstream' })).mockResolvedValue(candidate);
        const result = await batchAutoMatchLocalSongMetadata([song('bad'), song('good')]);
        expect(result.updates.map(update => update.status).sort()).toEqual(['failed', 'matched']);
    });
});

it('recovers a temporary search failure inside one batch and reports a final success only once', async () => {
    vi.useFakeTimers();
    try {
        const { appDatabase } = await import('@/services/appDatabase');
        const readLocalSong = vi.spyOn(appDatabase.local_music, 'get');
        vi.mocked(readLocalSong).mockResolvedValue(song('recover'));
        vi.mocked(findAutomaticOnlineMetadataCandidate).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(candidate);
        const onUpdate = vi.fn();
        const result = batchAutoMatchLocalSongMetadata([song('recover')], { onUpdate });
        await vi.runAllTimersAsync();
        expect((await result).updates).toMatchObject([{ songId: 'recover', status: 'matched', attempts: 2 }]);
        expect(onUpdate).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
});
it('does not repeat successful work in a recovery pass', async () => {
    vi.useFakeTimers();
    try {
        const { appDatabase } = await import('@/services/appDatabase');
        const readLocalSong = vi.spyOn(appDatabase.local_music, 'get');
        vi.mocked(readLocalSong).mockImplementation(async id => song(String(id)));
        const calls = new Map<string, number>();
        vi.mocked(findAutomaticOnlineMetadataCandidate).mockImplementation(async item => {
            const count = (calls.get(item.id) ?? 0) + 1; calls.set(item.id, count);
            if (item.id === 'flaky' && count === 1) throw new TypeError('offline');
            return candidate;
        });
        const pending = batchAutoMatchLocalSongMetadata([song('good'), song('flaky')]);
        await vi.runAllTimersAsync();
        expect((await pending).updates.every(update => update.status === 'matched')).toBe(true);
        expect(calls.get('good')).toBe(1);
        expect(calls.get('flaky')).toBe(2);
    } finally { vi.useRealTimers(); }
});

it('cancels during automatic backoff without applying or starting a recovery write', async () => {
    vi.useFakeTimers();
    try {
        vi.mocked(findAutomaticOnlineMetadataCandidate).mockRejectedValue(new TypeError('temporary fixture'));
        vi.mocked(applyLocalSongMatchSelection).mockClear();
        const controller = new AbortController();
        const result = batchAutoMatchLocalSongMetadata([song('backoff-cancel')], { signal: controller.signal });
        setTimeout(() => controller.abort(), 500);
        await vi.runAllTimersAsync();
        expect((await result).updates).toMatchObject([{ songId: 'backoff-cancel', status: 'cancelled' }]);
        expect(applyLocalSongMatchSelection).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
});
