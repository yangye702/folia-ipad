import { memo, useState } from 'react';
import { Disc } from 'lucide-react';
import { getSizedCoverUrl } from '../../../../utils/coverUrl';

// Home artwork keeps the existing disc placeholder when decoding fails.

type Grid3DArtworkProps = {
    coverUrl: string;
    size: number;
    alt: string;
    fullBleed?: boolean;
};

export const Grid3DArtwork = memo(function Grid3DArtwork({ coverUrl, size, alt, fullBleed = false }: Grid3DArtworkProps) {
    const [failed, setFailed] = useState(false);
    if (failed) {
        const disc = <Disc size={64} className="opacity-20" />;
        return fullBleed
            ? <div className="w-full h-full bg-zinc-800/20 flex items-center justify-center">{disc}</div>
            : disc;
    }
    return (
        <img
            src={getSizedCoverUrl(coverUrl, size)}
            alt={alt}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="w-full h-full object-cover pointer-events-none select-none"
        />
    );
});
