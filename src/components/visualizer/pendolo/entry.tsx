import React from 'react';
import { Disc3 } from 'lucide-react';
import { QuickControlChip, QuickControlToggle } from '../../shared/QuickControlChip';
import type { VisualizerQuickControlsProps } from '../definition';
import { DEFAULT_PENDOLO_TUNING, type PendoloTuning } from '../../../types';
import { defineVisualizer } from '../definition';
import PendoloSettingsPanel from './PendoloSettingsPanel';

const VisualizerPendolo = React.lazy(() => import('./VisualizerPendolo'));

// src/components/visualizer/pendolo/entry.tsx

export default defineVisualizer({
    mode: 'pendolo',
    order: 100,
    labelKey: 'ui.visualizerPendolo',
    labelFallback: 'Pendolo',
    previewSeed: 'pendolo',
    previewStartOffset: 0,
    // 时计：左侧齿轮，右侧歌词
    glyph: (
        <>
            <circle cx="8" cy="12" r="5" />
            <circle cx="8" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <path d="M16 10h5" opacity="0.55" />
            <path d="M16 14h4" opacity="0.55" />
        </>
    ),
    command: {
        title: 'Visualizer: Pendolo',
        description: 'Switch to Pendolo visualizer',
        keywords: ['pendolo', '擒纵', '摆轮', 'pd', '切换到可视化：擒纵', '切换到可视化擒纵'],
    },
    seeksOnLineClick: true,
    // The song-scoped seed resets Pendolo's lyric rail state before the next track starts.
    render: props => <VisualizerPendolo key={props.seed} {...props} />,
    renderQuickControls: ({ t, isDaylight, theme, tuning = DEFAULT_PENDOLO_TUNING, onTuningChange }: VisualizerQuickControlsProps<PendoloTuning>) => {
        const gears = ['none', 'subtle', 'full'] as const;
        const labels = { none: 'options.decorNone', subtle: 'options.decorSubtle', full: 'options.decorFull' };
        const gearLabel = t(labels[tuning.showGearDecor]);
        const showCover = tuning.showCoverOnWatchFace ?? false;
        return <>
            <QuickControlToggle active={showCover} theme={theme} label={t('options.pendoloShowCoverOnWatchFace')} onToggle={() => onTuningChange({ showCoverOnWatchFace: !showCover })}><Disc3 size={14} /></QuickControlToggle>
            <QuickControlChip isDaylight={isDaylight} label={gearLabel} title={`${t('options.pendoloShowGearDecor')}: ${gearLabel}`} onClick={() => onTuningChange({ showGearDecor: gears[(gears.indexOf(tuning.showGearDecor) + 1) % gears.length] })} />
        </>;
    },
    renderSettingsPanel: props => <PendoloSettingsPanel {...props} />,
});
