import React, { useRef, useState } from 'react';
import QueueTab from '../../src/components/panelTab/QueueTab';
import CommandPaletteQueueList from '../../src/components/command-palette/CommandPaletteQueueList';
import type { CommandPaletteMatch } from '../../src/components/command-palette/types';
import type { SongResult } from '../../src/types';
import { settingsTokens } from '../../src/components/modal/settings/kit/kitTheme';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import type { ProbeDefinition } from './definition';

// Real queue entry components; actions report their existing callback without mutating a library.
const songs: SongResult[] = [1, 2].map(id => ({
    id,
    name: `Synthetic queue song ${id}`,
    artists: [{ id: 7, name: 'Fixture Artist' }],
    album: { id: 8, name: 'Album' },
    durationMs: 60000,
}));
const matches: CommandPaletteMatch[] = songs.map((song, index) => ({
    score: 1,
    input: '',
    command: {
        id: `song-${index}`,
        group: 'playback',
        title: song.name,
        description: 'Synthetic queue entry',
        keywords: [],
        queueSong: song,
        queueIndex: index,
        execute: () => true,
    },
}));

function Probe() {
    const scroll = useRef<HTMLDivElement>(null);
    const [result, setResult] = useState('none');
    const actions = {
        onMoveSongToNext: (index: number) => setResult(`next:${index}`),
        onMoveSongToEnd: (index: number) => setResult(`end:${index}`),
        onRemoveSong: (index: number) => setResult(`remove:${index}`),
    };
    return (
        <div className="min-h-screen p-4 text-white" style={settingsTokens(false, DEFAULT_THEME)}>
            <section data-queue-probe="panel" className="mb-8 w-[340px] max-w-full">
                <QueueTab playQueue={songs} currentSong={songs[0]} onPlaySong={() => setResult('play')} queueScrollRef={scroll} {...actions} />
            </section>
            <section data-queue-probe="palette" className="h-[160px] w-[340px] max-w-full">
                <CommandPaletteQueueList
                    activeIndex={0} currentSong={songs[0]} isDaylight={false} isExecuting={false}
                    matches={matches} query="" onActiveIndexChange={() => {}}
                    onExecuteMatch={async () => { setResult('play'); return true; }} {...actions}
                />
            </section>
            <output data-queue-result>{result}</output>
        </div>
    );
}
export default {
    id: 'ipadQueueTouch',
    title: 'iPad queue touch actions',
    description: 'Player tab and command queue editing with real hit testing.',
    Component: Probe,
} satisfies ProbeDefinition;
