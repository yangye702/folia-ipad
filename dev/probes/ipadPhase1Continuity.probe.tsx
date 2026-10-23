import React, { Profiler, useRef, useState } from 'react';
import { motionValue } from 'framer-motion';
import VisualizerMonet from '../../src/components/visualizer/monet/VisualizerMonet';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import type { ProbeDefinition } from './definition';
import { useLayerAnimation, useShownLayers, type ShownLayer } from '../../src/components/visualizer/styleTransition/layerTransition';
import softFocus from '../../src/components/visualizer/styleTransition/softFocus';
import { audioBands } from '../../src/stores/motionSignals';

// Real Monet commits and the shared browser animation layers, with synthetic metadata only.
const clock = motionValue(8);
const power = motionValue(0);
const cover = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/></svg>`)}`;
function Layer({ layer, onLeft }: { layer: ShownLayer<string>; onLeft: (key: number) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayerAnimation(ref, layer, softFocus, onLeft);
    return <div ref={ref} data-phase1-layer={layer.value} data-layer-key={layer.key} className="absolute inset-0" style={{ background: layer.value === 'A' ? '#7c3aed' : '#10b981' }} />;
}
function Probe() {
    const [song, setSong] = useState('Song A');
    const [value, setValue] = useState('A');
    const [layers, onLeft] = useShownLayers(value, true, false);
    const previousTitle = useRef<Element | null>(null);
    const captured = useRef(false);
    return <div id="phase1-continuity" className="relative h-screen bg-zinc-950">
        <Profiler id="monet" onRender={() => {
            const host = document.getElementById('phase1-continuity');
            const title = host?.querySelector('.line-clamp-2')?.parentElement?.parentElement ?? null;
            if (song === 'Song A') previousTitle.current = title;
            if (song === 'Song B' && !captured.current && host) {
                captured.current = true;
                host.dataset.firstSongCommitReused = String(title === previousTitle.current);
            }
        }}>
            <VisualizerMonet currentTime={clock} currentLineIndex={0} lines={[{ id: 'line', startTime: 0, endTime: 20, fullText: '清晨的站台没有人说话', words: [{ text: '清晨的站台没有人说话', startTime: 0, endTime: 20 }] }]} theme={DEFAULT_THEME} subtitleTheme={DEFAULT_THEME} audioPower={power} audioBands={audioBands} duration={30} seed={song} songTitle={song} songArtist="Folia test artist" songAlbum="Synthetic album" coverUrl={cover(song === 'Song A' ? '#7c3aed' : '#10b981')} staticMode />
        </Profiler>
        <div className="absolute bottom-4 left-4 z-50 flex gap-3 text-black">
            <button className="min-h-11 rounded bg-white px-3" onClick={() => setSong('Song B')}>Change song</button>
            <button className="min-h-11 rounded bg-white px-3" onClick={() => { setValue('B'); window.setTimeout(() => setValue('A'), 120); }}>Switch and return</button>
            <button className="min-h-11 rounded bg-white px-3" onClick={() => { setValue('B'); window.setTimeout(() => setValue('C'), 110); window.setTimeout(() => setValue('B'), 220); }}>Interrupt entering layer</button>
        </div>
        <div className="absolute right-4 top-4 h-24 w-24 overflow-hidden rounded-2xl" data-phase1-layers>{layers.map(layer => <Layer key={layer.key} layer={layer} onLeft={onLeft} />)}</div>
    </div>;
}
export default { id: 'ipadPhase1Continuity', title: 'iPad continuity', description: 'Monet first commit and returning to a still-mounted layer.', Component: Probe } satisfies ProbeDefinition;
