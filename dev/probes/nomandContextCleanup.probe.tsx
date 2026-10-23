import React, { useState } from 'react';
import NomandBackgroundLayer from '../../src/components/visualizer/backgrounds/nomand/NomandBackgroundLayer';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import { DEFAULT_NOMAND_BACKGROUND_TUNING } from '../../src/types';
import type { ProbeDefinition } from './definition';

// Actual Nomand shader replacement and teardown over an isolated synthetic cover.
const COVER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%23d47b42"/%3E%3C/svg%3E';

const NomandContextCleanupProbe: React.FC = () => {
    const [alternate, setAlternate] = useState(false);
    return (
        <div className="relative h-screen w-screen">
            <NomandBackgroundLayer
                coverUrl={COVER}
                theme={DEFAULT_THEME}
                tuning={{ ...DEFAULT_NOMAND_BACKGROUND_TUNING, effect: alternate ? 'halftone-dots' : 'dithering' }}
            />
            <button type="button" className="absolute left-4 top-4 z-10" onClick={() => setAlternate(value => !value)}>
                Change effect
            </button>
        </div>
    );
};

export default {
    id: 'nomandContextCleanup',
    title: 'Nomand context cleanup',
    description: 'Synthetic cover shader replacement and unmount, using the real Paper runtime.',
    Component: NomandContextCleanupProbe,
} satisfies ProbeDefinition;
