import { getFromCache, removeFromCache, saveToCache } from './db';
import { createSafeObjectUrl, isBlob } from '../utils/blobGuards';
import {
    clearCoverAssets,
    getCoverAssetUsage,
    readCoverAsset,
    removeCoverAsset,
    writeCoverAsset,
    type BinaryAssetWriteResult,
} from './binaryAssetStore';
import { MatchFailure, recordMatchDiagnostic } from './matchingDiagnostics';
import { lyricProxyWebUrl } from './lyricProxy';

interface StoredCoverDescriptor extends BinaryAssetWriteResult { assetKey?: string; sourceUrl?: string; }

const isStoredCoverDescriptor = (value: unknown): value is StoredCoverDescriptor => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<StoredCoverDescriptor>;
    return (candidate.backend === 'opfs' || candidate.backend === 'electron')
        && typeof candidate.mimeType === 'string'
        && typeof candidate.size === 'number'
        && typeof candidate.updatedAt === 'number';
};

const buildCoverRequestUrl = (coverUrl: string): string => {
    if (typeof window !== 'undefined' && window.electron) return coverUrl;
    try {
        const hostname = new URL(coverUrl).hostname;
        if (hostname === 'y.gtimg.cn'
            || hostname === 'kugou.com' || hostname.endsWith('.kugou.com')
            || hostname === 'kgimg.com' || hostname.endsWith('.kgimg.com')) {
            return lyricProxyWebUrl(coverUrl);
        }
    } catch {
        return coverUrl;
    }
    return coverUrl;
};

const fetchCoverBlob = async (coverUrl: string, signal?: AbortSignal): Promise<Blob> => {
    let response: Response;
    try { response = await fetch(buildCoverRequestUrl(coverUrl), { mode: 'cors', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) }); }
    catch (error) { throw new MatchFailure((error as Error).name === 'TimeoutError' ? 'timeout' : 'network', 'cover-fetch'); }
    if (response.ok === false) {
        const error = new MatchFailure(response.status === 403 ? 'proxy-refused' : 'http', 'cover-fetch');
        Object.assign(error, { status: response.status });
        throw error;
    }
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith('image/')) throw new MatchFailure('invalid-image', 'cover-decode');
    if (typeof createImageBitmap === 'function') {
        try { const image = await createImageBitmap(blob); image.close(); }
        catch { throw new MatchFailure('invalid-image', 'cover-decode'); }
    }
    return blob;
};

export interface PreparedCover {
    commit: () => Promise<void>;
    finish: () => Promise<void>;
    discard: () => Promise<void>;
}

// New bytes are staged first; callers can commit the descriptor in their existing song transaction.
const stageCover = async (cacheKey: string, blob: Blob, sourceUrl: string, signal?: AbortSignal): Promise<PreparedCover> => {
    const old = await getFromCache<unknown>(cacheKey);
    const assetKey = `${cacheKey}_${crypto.randomUUID()}`;
    let descriptor: BinaryAssetWriteResult | null;
    try {
        signal?.throwIfAborted();
        descriptor = await writeCoverAsset(assetKey, blob);
        signal?.throwIfAborted();
        if (!descriptor) throw new Error('Cover storage unavailable');
    } catch (error) {
        await removeCoverAsset(assetKey).catch(() => undefined);
        if ((error as Error).name === 'AbortError') throw error;
        throw new MatchFailure('storage', 'cover-cache');
    }
    return {
        commit: async () => {
            signal?.throwIfAborted();
            try { await saveToCache(cacheKey, { ...descriptor, assetKey, sourceUrl }, { throwOnError: true }); }
            catch { throw new MatchFailure('storage', 'cover-cache'); }
        },
        discard: async () => { await removeCoverAsset(assetKey).catch(() => undefined); },
        finish: async () => {
            if (typeof caches !== 'undefined' && /^https:\/\//i.test(sourceUrl)) {
                try { const cache = await caches.open('folia-online-covers-v1'); await cache.put(sourceUrl, new Response(blob, { headers: { 'Content-Type': blob.type } })); }
                catch { /* OPFS remains the durable copy when Cache Storage is unavailable. */ }
            }
            if (isStoredCoverDescriptor(old)) await removeCoverAsset(old.assetKey || cacheKey).catch(() => undefined);
        },
    };
};

export const prepareLocalSongOnlineCover = async (songId: string, coverUrl: string, signal?: AbortSignal): Promise<PreparedCover> => (
    await stageCover(`cover_local_${songId}`, await fetchCoverBlob(coverUrl, signal), coverUrl, signal)
);

const persistCover = async (cacheKey: string, blob: Blob, sourceUrl: string, signal?: AbortSignal): Promise<void> => {
    const prepared = await stageCover(cacheKey, blob, sourceUrl, signal);
    try { await prepared.commit(); }
    catch { await prepared.discard(); throw new MatchFailure('storage', 'cover-cache'); }
    await prepared.finish();
};

export async function getCachedCoverUrl(cacheKey: string, sourceUrl?: string): Promise<string | null> {
    const stored = await getFromCache<unknown>(cacheKey);
    if (sourceUrl && (isBlob(stored) || isStoredCoverDescriptor(stored) && stored.sourceUrl !== sourceUrl)) return null;
    if (isBlob(stored)) {
        const descriptor = await writeCoverAsset(cacheKey, stored).catch(() => null);
        if (!descriptor) {
            return createSafeObjectUrl(stored);
        }
        await saveToCache(cacheKey, descriptor);
        return createSafeObjectUrl(stored);
    }

    if (stored !== null && !isStoredCoverDescriptor(stored)) {
        await removeFromCache(cacheKey);
        await removeCoverAsset(cacheKey);
        return null;
    }

    const cachedCover = await readCoverAsset(isStoredCoverDescriptor(stored) ? stored.assetKey || cacheKey : cacheKey, isStoredCoverDescriptor(stored) ? stored.mimeType : undefined);
    if (!cachedCover) {
        if (stored) await removeFromCache(cacheKey);
        return null;
    }
    if (sourceUrl && typeof createImageBitmap === 'function') {
        try { const image = await createImageBitmap(cachedCover); image.close(); }
        catch { recordMatchDiagnostic({ stage: 'cover-decode', outcome: 'invalid-image' }); return null; }
    }
    return createSafeObjectUrl(cachedCover);
}

/**
 * Whether a cover is already stored, without minting an object URL to find out.
 *
 * `getCachedCoverUrl` is the wrong question to ask when nothing is going to be displayed: it reads
 * the bytes and hands back a URL that a caller checking for mere existence then has to remember to
 * revoke. Checks the descriptor and backing bytes without allocating a URL, and accepts the legacy
 * raw-Blob shape, so a cover written before the asset store existed still counts as cached.
 */
export async function hasCachedCover(cacheKey: string): Promise<boolean> {
    const stored = await getFromCache<unknown>(cacheKey);
    return isBlob(stored) || (isStoredCoverDescriptor(stored) && Boolean(await readCoverAsset(stored.assetKey || cacheKey, stored.mimeType)));
}

export async function loadCachedOrFetchCover(cacheKey: string, coverUrl?: string | null): Promise<string | null> {
    if (!coverUrl) return null;

    try {
        const cachedCoverUrl = await getCachedCoverUrl(cacheKey, coverUrl);
        if (cachedCoverUrl) {
            return cachedCoverUrl;
        }

        const coverBlob = await fetchCoverBlob(coverUrl);
        await persistCover(cacheKey, coverBlob, coverUrl).catch(() => undefined);
        return createSafeObjectUrl(coverBlob) || coverUrl;
    } catch (error) {
        recordMatchDiagnostic({ stage: 'cover-cache', error });
        const stored = await getFromCache<unknown>(cacheKey).catch(() => null);
        // Older caches have no URL identity: retain their offline usability without blessing a known mismatch.
        if (isBlob(stored) || isStoredCoverDescriptor(stored) && !stored.sourceUrl) {
            const legacy = await getCachedCoverUrl(cacheKey);
            if (legacy) return legacy;
        }
        return coverUrl;
    }
}

export async function saveCoverBlob(cacheKey: string, coverBlob: Blob): Promise<void> {
    const descriptor = await writeCoverAsset(cacheKey, coverBlob).catch(() => null);
    if (descriptor) {
        await saveToCache(cacheKey, descriptor);
        return;
    }
    await saveToCache(cacheKey, coverBlob);
}

// Replaces the cached online cover used by local-song playback without changing the audio file.
export async function cacheLocalSongOnlineCover(songId: string, coverUrl: string, signal?: AbortSignal, onFailure?: (error: unknown) => void): Promise<boolean> {
    const cacheKey = `cover_local_${songId}`;
    try {
        signal?.throwIfAborted();
        await persistCover(cacheKey, await fetchCoverBlob(coverUrl, signal), coverUrl, signal);
        recordMatchDiagnostic({ stage: 'cover-cache', outcome: 'success' });
        return true;
    } catch (error) {
        recordMatchDiagnostic({ stage: 'cover-cache', error });
        onFailure?.(error);
        return false;
    }
}

export async function removeCachedCover(cacheKey: string): Promise<void> {
    const stored = await getFromCache<unknown>(cacheKey);
    await removeFromCache(cacheKey);
    await removeCoverAsset(isStoredCoverDescriptor(stored) ? stored.assetKey || cacheKey : cacheKey);
}

export { clearCoverAssets, getCoverAssetUsage };
