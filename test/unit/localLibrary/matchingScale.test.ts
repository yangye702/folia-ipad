import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { LocalSong, SongResult } from '@/types';
import { batchAutoMatchLocalSongMetadata } from '@/services/localSongMetadataMatchService';
import { neteaseApi } from '@/services/onlineMusic/netease/netease';
import { searchQQLyrics } from '@/services/onlineMusic/qq/qqLyricProvider';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';

// Real batch/search/admission code, controlled provider responses and synthetic in-memory save boundary.
const state = vi.hoisted(() => ({ songs: new Map<string, LocalSong>(), covers: new Set<string>(), saves: [] as string[] }));
vi.mock('@/services/onlineMusic/netease/netease', () => ({ neteaseApi: { cloudSearch: vi.fn() } }));
vi.mock('@/services/onlineMusic/qq/qqLyricProvider', () => ({ searchQQLyrics: vi.fn() }));
vi.mock('@/services/appDatabase', () => ({ appDatabase: { local_music: { get: async (id: string) => state.songs.get(id) } } }));
vi.mock('@/services/coverCache', () => ({ getCachedCoverUrl: async (key: string) => state.covers.has(key.replace('cover_local_', '')) ? 'blob:fixture' : null }));
vi.mock('@/services/localSongMatchSelectionService', () => ({
    applyLocalSongMatchSelection: async (input: any) => {
        input.signal?.throwIfAborted();
        const song = state.songs.get(input.songId)!;
        if (input.metadata === 'online') song.onlineMetadata = { ...input.candidate, matchMode: 'automatic', matchedAt: Date.now() };
        if (input.cover === 'online') { state.covers.add(song.id); song.onlineMetadata!.coverUrl = input.candidate.coverUrl; }
        state.saves.push(song.id);
        return { coverAttempted: input.cover === 'online', coverCached: state.covers.has(song.id), lyricsApplied: false, partialLyricsFailure: false };
    },
}));
const reports: unknown[] = [];
const baseline = process.env.P0_SCALE_BASELINE === '1';
beforeEach(() => { vi.clearAllMocks(); state.songs.clear(); state.covers.clear(); state.saves = []; vi.useFakeTimers(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const makeSong = (index: number, identity = index): LocalSong => ({
    id: `scale-${index}`, fileName: `Synthetic ${identity}.mp3`, filePath: '', title: `Synthetic ${identity}`, titleOrigin: 'import',
    importedMetadata: { title: `Synthetic ${identity}`, titleSource: 'embedded', artistNames: ['Synthetic Artist'], albumName: 'Synthetic Album' },
    duration: 200000, addedAt: 1, fileSize: 1, mimeType: 'audio/mpeg',
});

async function scenario(size: number, mode: string) {
    const started = Date.now();
    const controller = new AbortController();
    const calls: Array<{ source: string; query: string }> = [];
    const counts = new Map<string, number>();
    const songs = Array.from({ length: size }, (_, i) => makeSong(i, mode === 'dedup' ? Math.floor(i / 2) : i));
    songs.forEach(song => state.songs.set(song.id, structuredClone(song)));
    let active = 0, maxActive = 0, successfulResponses = 0;
    const activeSources = new Map<string, number>();
    let maxSourceActive = 0;
    const upstream = async (source: string, query: string): Promise<SongResult[]> => {
        calls.push({ source, query });
        const key = `${source}:${query}`; counts.set(key, (counts.get(key) ?? 0) + 1);
        active++; maxActive = Math.max(maxActive, active);
        activeSources.set(source, (activeSources.get(source) ?? 0) + 1);
        maxSourceActive = Math.max(maxSourceActive, activeSources.get(source)!);
        await new Promise(resolve => setTimeout(resolve, 10));
        active--; activeSources.set(source, activeSources.get(source)! - 1);
        if ((mode === 'missing-backend' || mode === 'outage' || mode === 'refused') && source === 'netease') throw Object.assign(new Error('fixture missing'), { code: 'NETEASE_API_BASE_MISSING' });
        if (mode === 'outage' && Date.now() - started < 1500 && source !== 'netease') throw new TypeError('Controlled temporary outage');
        if (mode === 'refused') throw source === 'qq' ? Object.assign(new Error('fixture'), { kind: 'upstream', summary: { httpStatus: 200, requestCode: 2001 } }) : new TypeError('Controlled offline');
        successfulResponses++;
        const identity = Number(query.match(/Synthetic (\d+)/)?.[1] ?? 0);
        const low = mode === 'mixed' && identity % 10 === 0;
        const coverless = mode === 'mixed' && source === 'netease';
        return [{ id: identity + 1, name: `Synthetic ${identity}`, durationMs: 200000, artists: [{ id: 7, name: low ? 'Other Artist' : 'Synthetic Artist' }],
            album: { id: 8, name: 'Synthetic Album', ...(coverless ? {} : { coverUrl: `https://images.test/${identity}.png` }) } }];
    };
    vi.mocked(neteaseApi.cloudSearch).mockImplementation(async query => ({ result: { songs: (await upstream('netease', query)).map(song => ({ id: song.id, name: song.name, dt: song.durationMs, ar: song.artists, al: { name: song.album.name, picUrl: song.album.coverUrl } })) } }));
    vi.mocked(searchQQLyrics).mockImplementation(query => upstream('qq', query));
    vi.spyOn(getOnlineMusicProvider('kugou')!.search!, 'searchSongs').mockImplementation(async query => ({ items: await upstream('kugou', query) as any, hasMore: false, nextOffset: 0 }));
    const updates: string[] = [];
    const pending = batchAutoMatchLocalSongMetadata(songs, { signal: controller.signal, onUpdate: update => {
        updates.push(update.songId);
        if (mode === 'cancel-resume' && updates.length === 5) controller.abort();
    } });
    await vi.runAllTimersAsync();
    const first = await pending;
    const savesAtCancel = state.saves.length;
    let finalUpdates = first.updates;
    if (mode === 'cancel-resume') {
        await vi.advanceTimersByTimeAsync(20000);
        expect(state.saves).toHaveLength(savesAtCancel);
        const todo = first.updates.filter(update => update.status !== 'matched' && update.status !== 'skipped').map(update => state.songs.get(update.songId)!);
        const resume = batchAutoMatchLocalSongMetadata(todo);
        await vi.runAllTimersAsync();
        const resumed = await resume;
        finalUpdates = [...first.updates.filter(update => ['matched', 'skipped'].includes(update.status)), ...resumed.updates];
    }
    const successes = first.updates.filter(update => update.status === 'matched').length;
    const report = { size, mode, baseline, searchSuccessRate: calls.length ? successfulResponses / calls.length : 0,
        matched: mode === 'cancel-resume' ? state.covers.size : successes, savedCovers: state.covers.size, requests: calls.length,
        repeatedQueries: [...counts.values()].reduce((sum, count) => sum + count - 1, 0), elapsedMs: Date.now() - started,
        finalStatuses: Object.fromEntries([...new Set(finalUpdates.map(item => item.status))].map(status => [status, finalUpdates.filter(item => item.status === status).length])),
        incorrectMatches: [...state.songs.values()].filter(song => song.onlineMetadata?.artists.some(artist => artist.name !== 'Synthetic Artist')).length,
        maxActive, maxSourceActive, sources: first.summary?.sources };
    reports.push(report);
    expect(report.incorrectMatches).toBe(0);
    if (!baseline) {
        expect(maxActive).toBeLessThanOrEqual(2);
        expect(maxSourceActive).toBe(1);
        expect(first.updates).toHaveLength(size);
        expect(new Set(first.updates.map(item => item.songId)).size).toBe(size);
        if (mode === 'refused') { expect(successes).toBe(0); expect(calls.filter(call => call.source === 'qq')).toHaveLength(size); }
        else if (mode === 'mixed') { expect(successes).toBe(size - Math.ceil(size / 10)); expect(state.covers.size).toBe(successes); }
        else expect(state.covers.size).toBe(size);
        if (mode === 'missing-backend' || mode === 'outage' || mode === 'refused') expect(calls.filter(call => call.source === 'netease')).toHaveLength(1);
        if (mode === 'dedup') expect(calls).toHaveLength(Math.ceil(size / 2));
        if (mode !== 'cancel-resume') expect(new Set(state.saves).size).toBe(state.saves.length);
    }
    const reportDir = process.env.P0_SCALE_REPORT_DIR;
    if (reportDir) {
        mkdirSync(reportDir, { recursive: true });
        writeFileSync(`${reportDir}/p0r2-scale-${baseline ? 'baseline' : 'current'}.json`, JSON.stringify(reports, null, 2));
    }
}
for (const size of [50, 100, 250, 1000]) {
    for (const mode of ['normal', 'missing-backend', 'outage', 'mixed', 'dedup', 'cancel-resume', 'refused']) {
        it(`${size} synthetic songs: ${mode}`, () => scenario(size, mode));
    }
}
