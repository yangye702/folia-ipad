import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { MatchingSearchSession, isRetryableMatchFailure } from '@/services/matchingSearchSession';
import { MatchFailure } from '@/services/matchingDiagnostics';

// Exercise scheduling and recovery independently of provider catalogs and user storage.
let source: string;
beforeEach(() => { source = expect.getState().currentTestName!; });
afterEach(() => { vi.useRealTimers(); });
it('deduplicates pending and completed queries without sharing target-specific ranking', async () => {
    const session = new MatchingSearchSession();
    let release!: (value: number[]) => void;
    const load = vi.fn(() => new Promise<number[]>(resolve => { release = resolve; }));
    const a = session.search(source, 'same', load);
    const b = session.search(source, 'same', load);
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    release([7]);
    expect(await Promise.all([a, b])).toEqual([[7], [7]]);
    expect(await session.search(source, 'same', load)).toEqual([7]);
    expect(load).toHaveBeenCalledOnce();
    expect(session.snapshot().sources[source].cacheHits).toBe(2);
});
it('suppresses a missing backend for the rest of the batch', async () => {
    const session = new MatchingSearchSession();
    const load = vi.fn().mockRejectedValue(Object.assign(new Error('not configured'), { code: 'FIXTURE_API_BASE_MISSING' }));
    await expect(session.search(source, 'one', load)).rejects.toBeDefined();
    await expect(session.search(source, 'two', load)).rejects.toMatchObject({ kind: 'source-unavailable' });
    expect(load).toHaveBeenCalledOnce();
    expect(session.snapshot().sources[source].skipped).toBe(1);
});
it('opens a transient cooldown and allows a bounded recovery probe', async () => {
    vi.useFakeTimers();
    const session = new MatchingSearchSession(true);
    const load = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue([1]);
    await expect(session.search(source, 'one', load)).rejects.toBeDefined();
    await expect(session.search(source, 'two', load)).rejects.toMatchObject({ kind: 'source-cooldown' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await session.search(source, 'two', load)).toEqual([1]);
    expect(session.snapshot().sources[source].recoveries).toBe(1);
});
it('does not retry or globally suppress query-dependent upstream refusals', async () => {
    const session = new MatchingSearchSession();
    const refusal = Object.assign(new Error('refused'), { kind: 'upstream', summary: { httpStatus: 200, requestCode: 2001 } });
    const load = vi.fn().mockRejectedValueOnce(refusal).mockResolvedValue([1]);
    await expect(session.search(source, 'one', load)).rejects.toBe(refusal);
    expect(await session.search(source, 'two', load)).toEqual([1]);
    expect(isRetryableMatchFailure(new MatchFailure('partial-search-failure', 'search', source, [refusal]))).toBe(false);
});
it('a cancelled subscriber cannot cancel a second caller or poison a completed cache', async () => {
    const session = new MatchingSearchSession();
    let release!: (value: number[]) => void;
    const load = vi.fn(() => new Promise<number[]>(resolve => { release = resolve; }));
    const controller = new AbortController();
    const a = session.search(source, 'same', load, controller.signal);
    const b = session.search(source, 'same', load);
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    controller.abort();
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    release([2]);
    expect(await b).toEqual([2]);
});
it('counts real HTTP refusal once and skips the remaining batch without fast retries', async () => {
    const session = new MatchingSearchSession();
    const load = vi.fn().mockRejectedValue({ httpStatus: 403 });
    await expect(session.search(source, 'one', load)).rejects.toBeDefined();
    await expect(session.search(source, 'two', load)).rejects.toMatchObject({ kind: 'source-unavailable' });
    expect(load).toHaveBeenCalledOnce();
});
it('serializes a source, paces starts, and does not timeout time spent waiting for its slot', async () => {
    vi.useFakeTimers();
    const session = new MatchingSearchSession();
    const starts: number[] = [];
    const load = vi.fn(async () => { starts.push(Date.now()); await new Promise(resolve => setTimeout(resolve, 10)); return [1]; });
    const result = Promise.all(Array.from({ length: 50 }, (_, i) => session.search(source, String(i), load)));
    await vi.runAllTimersAsync();
    expect(await result).toHaveLength(50);
    expect(starts.slice(1).every((start, i) => start - starts[i] >= 400)).toBe(true);
});
it('bounds a queued wait separately when a non-abortable raw request never settles', async () => {
    vi.useFakeTimers();
    const session = new MatchingSearchSession();
    let release!: (value: number[]) => void;
    const a = session.search(source, 'wedged', () => new Promise<number[]>(resolve => { release = resolve; }));
    const queued = vi.fn(async () => [2]);
    const b = session.search(source, 'queued', queued);
    const settled = Promise.allSettled([a, b]);
    await vi.advanceTimersByTimeAsync(30001);
    const answers = await settled;
    expect(answers[0]).toMatchObject({ status: 'rejected', reason: { kind: 'timeout' } });
    expect(answers[1]).toMatchObject({ status: 'rejected', reason: { kind: 'source-busy' } });
    await vi.advanceTimersByTimeAsync(5000);
    release([1]);
    await vi.runAllTimersAsync();
    expect(queued).not.toHaveBeenCalled();
});
it('keeps the shorter automatic lyric deadline while excluding source queue wait', async () => {
    vi.useFakeTimers();
    const session = new MatchingSearchSession(false, 3500);
    let release!: (value: number[]) => void;
    const pending = session.search(source, 'slow-lyrics', () => new Promise<number[]>(resolve => { release = resolve; }));
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(3501);
    await assertion;
    release([]);
});
it('skips an explicitly authentication-required source for the rest of the batch', async () => {
    const session = new MatchingSearchSession(true);
    const load = vi.fn().mockRejectedValue({ code: 'auth-required', cause: { code: 301 } });
    await expect(session.search(source, 'one', load)).rejects.toBeDefined();
    await expect(session.search(source, 'two', load)).rejects.toMatchObject({ kind: 'source-unavailable' });
    expect(load).toHaveBeenCalledOnce();
});
it('honors Retry-After without shortening a long cooldown to fit this batch', async () => {
    vi.useFakeTimers();
    const session = new MatchingSearchSession(true);
    const load = vi.fn().mockRejectedValue({ httpStatus: 429, retryAfterMs: 120000 });
    await expect(session.search(source, 'one', load)).rejects.toBeDefined();
    expect(await session.waitForRecovery()).toBe(false);
    await expect(session.search(source, 'two', load)).rejects.toMatchObject({ kind: 'source-cooldown' });
    expect(load).toHaveBeenCalledOnce();
});
it('lets an explicit standalone retry obtain a fresh response after a refused query', async () => {
    const session = new MatchingSearchSession();
    const load = vi.fn().mockRejectedValueOnce({ kind: 'upstream', summary: { requestCode: 2001 } }).mockResolvedValue([3]);
    await expect(session.search(source, 'same', load)).rejects.toBeDefined();
    expect(await session.search(source, 'same', load)).toEqual([3]);
    expect(load).toHaveBeenCalledTimes(2);
});
