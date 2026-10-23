import { useState } from 'react';
import { Grid3DSlider } from '../../src/library/suites/grid/home/Grid3DSlider';
import type { ProbeDefinition } from './definition';

// Real home cards with failed artwork and an address change, without provider or cache fixtures.

const INVALID_COVER = 'data:image/png;base64,broken';
const VALID_COVER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#2f9e44"/></svg>')}`;

function GridArtworkProbe() {
    const [coverUrl, setCoverUrl] = useState(INVALID_COVER);
    return (
        <div className="h-screen flex flex-col bg-zinc-100 text-zinc-900">
            <div className="relative z-10 flex gap-3 p-4">
                <button data-probe-action="valid" onClick={() => setCoverUrl(VALID_COVER)}>Valid cover</button>
                <button data-probe-action="invalid" onClick={() => setCoverUrl(INVALID_COVER)}>Invalid cover</button>
            </div>
            <Grid3DSlider
                items={[{ id: 'artwork', name: 'Artwork', coverUrl }]}
                focusedIndex={0}
                onFocusedIndexChange={() => {}}
                onSelect={() => {}}
                isDaylight
            />
        </div>
    );
}

export default {
    id: 'gridArtwork',
    title: 'Home artwork failure',
    description: 'Failed home artwork keeps the disc placeholder and recovers when its address changes.',
    Component: GridArtworkProbe,
} satisfies ProbeDefinition;
