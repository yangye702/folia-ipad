import { afterEach, expect, it, vi } from 'vitest';
import { getLocalLibraryAvailability } from '../../../src/services/localLibraryAvailability';

// Safari has OPFS but no directory picker; the Files import must remain available.
afterEach(() => vi.unstubAllGlobals());
it('allows secure Safari with private file storage and no directory picker', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:', hostname: 'folia.example' }, isSecureContext: true });
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({}) } });
    expect(getLocalLibraryAvailability()).toEqual({ supported: true, reason: null });
});
