import { MatchFailure, matchFailureFacts, recordMatchDiagnostic } from './matchingDiagnostics';

// Memory-only scheduling for matching searches; normal online playback and provider sessions are untouched.
export const isRetryableMatchFailure = (error: unknown): boolean => {
    if (error instanceof MatchFailure && error.causes?.length) return error.causes.some(isRetryableMatchFailure);
    const facts = matchFailureFacts(error);
    if (facts.kind === 'invalid-response') return false;
    return facts.kind === 'source-cooldown' || facts.kind === 'source-busy' || facts.kind === 'timeout'
        || facts.httpStatus === 429 || Boolean(facts.httpStatus && facts.httpStatus >= 500)
        || facts.kind === 'network' && !facts.httpStatus && facts.upstreamCode == null;
};
export const waitForMatchDelay = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
});
const observe = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return promise;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
};
const tails = new Map<string, Promise<void>>();
const lastStarts = new Map<string, number>();

// A non-abortable provider retains its lane until its real promise settles, even after the caller times out.
const inSourceLane = <T>(source: string, signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const answer = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    const queuedTimer = setTimeout(() => reject(new MatchFailure('source-busy', 'search-queue', source)), 30000);
    const slot = (tails.get(source) ?? Promise.resolve()).then(async () => {
        signal.throwIfAborted();
        const last = lastStarts.get(source) ?? -Infinity;
        const remaining = last > Date.now() ? 0 : last + 400 - Date.now();
        if (remaining > 0) await waitForMatchDelay(remaining, signal);
        signal.throwIfAborted();
        clearTimeout(queuedTimer);
        lastStarts.set(source, Date.now());
        const deadline = new AbortController();
        const timer = setTimeout(() => deadline.abort(Object.assign(new DOMException('Search timed out', 'TimeoutError'), { kind: 'timeout', stage: 'search' })), timeoutMs);
        const boundedSignal = AbortSignal.any([signal, deadline.signal]);
        const raw = Promise.resolve().then(() => run(boundedSignal));
        void observe(raw, boundedSignal).then(resolve, reject).finally(() => clearTimeout(timer));
        await raw.catch(() => undefined);
    }).catch(reject);
    const tail = slot.then(() => undefined);
    tails.set(source, tail);
    void tail.then(() => { if (tails.get(source) === tail) tails.delete(source); });
    return observe(answer, signal).finally(() => clearTimeout(queuedTimer));
};

type SourceState = { requests: number; successes: number; failures: number; cacheHits: number; skipped: number; recoveries: number; streak: number; until: number; blocked?: boolean; lastFailure?: ReturnType<typeof matchFailureFacts> };
type Pending = { promise: Promise<unknown>; controller: AbortController; subscribers: number };
type Cached = { until: number; value?: unknown; error?: unknown };

export class MatchingSearchSession {
    constructor(private readonly batch = false, private readonly timeoutMs = 15000) {}
    private readonly stableFailures = new Map<string, unknown>();
    private readonly states = new Map<string, SourceState>();
    private readonly pending = new Map<string, Pending>();
    private readonly cache = new Map<string, Cached>();
    private state(source: string): SourceState {
        let state = this.states.get(source);
        if (!state) { state = { requests: 0, successes: 0, failures: 0, cacheHits: 0, skipped: 0, recoveries: 0, streak: 0, until: 0 }; this.states.set(source, state); }
        return state;
    }
    private guard(source: string) {
        const state = this.state(source);
        if (state.blocked && !this.batch && !/_API_BASE_MISSING$/.test(state.lastFailure?.kind ?? '') && Date.now() >= state.until) state.blocked = false;
        if (!state.blocked && Date.now() >= state.until) return;
        state.skipped++;
        throw new MatchFailure(state.blocked ? 'source-unavailable' : 'source-cooldown', 'search', source,
            state.lastFailure ? [Object.assign(new Error('Source paused'), state.lastFailure)] : undefined);
    }
    snapshot() {
        return { requestUnit: 'provider-search' as const, sources: Object.fromEntries([...this.states].map(([source, state]) => [source, { ...state }])) };
    }
    async waitForRecovery(signal?: AbortSignal): Promise<boolean> {
        const deadlines = [...this.states.values()].filter(state => !state.blocked && state.until > Date.now()).map(state => state.until);
        const wait = deadlines.length ? Math.min(...deadlines) - Date.now() : 1000;
        // A long Retry-After is reported, never shortened to squeeze it into this batch.
        if (wait > 60000) return false;
        await waitForMatchDelay(Math.max(1000, wait), signal);
        return true;
    }
    dispose() { for (const pending of this.pending.values()) pending.controller.abort(); this.cache.clear(); this.stableFailures.clear(); }

    async search<T>(source: string, key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
        signal?.throwIfAborted();
        const cacheKey = JSON.stringify([source, key]);
        const state = this.state(source);
        if (this.stableFailures.has(cacheKey)) { state.cacheHits++; throw this.stableFailures.get(cacheKey); }
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() < cached.until) {
            state.cacheHits++;
            if (cached.error) throw cached.error;
            return cached.value as T;
        }
        if (!this.batch && !state.blocked && state.until > Date.now() && state.until - Date.now() <= 60000) {
            await waitForMatchDelay(state.until - Date.now(), signal);
        }
        let task = this.pending.get(cacheKey);
        if (task?.controller.signal.aborted) task = undefined;
        if (!task) {
            this.guard(source);
            const controller = new AbortController();
            const promise = inSourceLane(source, controller.signal, async boundedSignal => {
                this.guard(source);
                boundedSignal.throwIfAborted();
                state.requests++;
                const result = await load(boundedSignal);
                boundedSignal.throwIfAborted();
                return result;
            }, this.timeoutMs).then(value => {
                if (controller.signal.aborted) throw controller.signal.reason;
                if (state.streak) state.recoveries++;
                state.streak = 0; state.until = 0; state.successes++;
                this.cache.set(cacheKey, { until: Date.now() + (Array.isArray(value) && !value.length ? 15000 : 300000), value });
                return value;
            }, error => {
                if (controller.signal.aborted || (error as Error)?.name === 'AbortError') throw error;
                const facts = matchFailureFacts(error);
                if (facts.kind === 'source-unavailable' || facts.kind === 'source-cooldown') throw error;
                state.failures++; state.lastFailure = facts;
                if ((error as { code?: string })?.code === 'auth-required' || facts.kind === 'not-configured' || /_API_BASE_MISSING$/.test(facts.kind) || [401, 403].includes(facts.httpStatus ?? 0)) { state.blocked = true; state.until = Date.now() + 60000; }
                else if (isRetryableMatchFailure(error)) {
                    state.streak++;
                    const retryAfter = facts.retryAfterMs;
                    state.until = Date.now() + Math.max(Math.min(1000 * 2 ** (state.streak - 1), 30000), Number.isFinite(retryAfter) ? retryAfter! : 0);
                } else if (this.batch) {
                    this.stableFailures.set(cacheKey, error);
                    if (this.stableFailures.size > 2000) this.stableFailures.delete(this.stableFailures.keys().next().value!);
                }
                recordMatchDiagnostic({ stage: 'source-health', source, error });
                throw error;
            }).finally(() => {
                // Retire an expired queued request too; a settled caller must never start a late network request.
                controller.abort();
                if (this.pending.get(cacheKey)?.controller === controller) this.pending.delete(cacheKey);
                while (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
            });
            task = { promise, controller, subscribers: 0 };
            this.pending.set(cacheKey, task);
        } else state.cacheHits++;
        task.subscribers++;
        try { return await observe(task.promise as Promise<T>, signal); }
        finally {
            task.subscribers--;
            if (!task.subscribers && this.pending.get(cacheKey) === task) task.controller.abort();
        }
    }
}

export const defaultMatchingSearchSession = new MatchingSearchSession();
