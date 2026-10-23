import { afterEach, expect, it, vi } from 'vitest';
import { getMatchingDiagnostics, recordMatchDiagnostic, subscribeMatchingDiagnostics } from '@/services/matchingDiagnostics';
// Evidence must stay bounded, opt-in, and independent of raw error messages/credentials.
afterEach(() => vi.unstubAllGlobals());
it('omits raw exception payloads and limits touch-copyable evidence', () => {
    vi.stubGlobal('window', { location: { search: '?matchDebug=1' } });
    const off = subscribeMatchingDiagnostics(() => { throw new Error('observer fixture'); });
    for (let i = 0; i < 65; i++) recordMatchDiagnostic({ stage: 'search', source: 'fixture', error: Object.assign(new Error('credential=never-copy-this'), { status: 403, cookie: 'never-copy-this' }) });
    off();
    expect(getMatchingDiagnostics()).toHaveLength(60);
    expect(JSON.stringify(getMatchingDiagnostics())).not.toContain('never-copy-this');
    expect(getMatchingDiagnostics().at(-1)).toMatchObject({ httpStatus: 403, kind: 'http' });
});
it('does not record when debug is disabled', () => {
    vi.stubGlobal('window', { location: { search: '' } });
    const before = getMatchingDiagnostics();
    recordMatchDiagnostic({ stage: 'search', count: 3 });
    expect(getMatchingDiagnostics()).toBe(before);
});
