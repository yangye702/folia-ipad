// Stable same-origin image route backed by the existing PWA worker's online artwork cache.
export const onlineCoverDisplayUrl = (url: string | undefined): string | undefined => {
    if (!url || typeof navigator === 'undefined' || !navigator.serviceWorker?.controller || !/^https:\/\//i.test(url)) return url;
    return `/__folia_online_cover/?url=${encodeURIComponent(url)}`;
};
