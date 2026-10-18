import React from 'react';
import { Info, Grip, AudioLines } from 'lucide-react';
import { QuickControlChip, QuickControlToggle } from '../../shared/QuickControlChip';
import type { VisualizerQuickControlsProps } from '../definition';
import { DEFAULT_MONET_TUNING, type MonetTuning } from '../../../types';
import { defineVisualizer } from '../definition';
import { MonetSettingsPanel } from './MonetSettingsPanel';

const VisualizerMonet = React.lazy(() => import('./VisualizerMonet'));

// src/components/visualizer/monet/entry.tsx
// Registers the Monet poster visualizer and its mode-owned settings panel.
export default defineVisualizer({
    mode: 'monet',
    order: 90,
    labelKey: 'ui.visualizerMonet',
    labelFallback: 'Monet',
    previewSeed: 'monet',
    previewStartOffset: 0,
    // 莫奈：左侧关键字，右侧立绘
    glyph: (
        <>
            <path d="M3 9.5h7" />
            <path d="M3 13.5h5" opacity="0.55" />
            <rect x="14" y="5" width="7" height="14" rx="1.5" opacity="0.55" />
        </>
    ),
    command: {
        title: 'Visualizer: Monet',
        description: 'Switch to Monet visualizer',
        keywords: ['monet', '莫奈', '切换到可视化：莫奈', '切换到可视化莫奈'],
    },
    seeksOnLineClick: true,
    render: props => {
        const monetTuning = props.monetTuning ?? DEFAULT_MONET_TUNING;
        const lyricsFontScale = props.lyricsFontScale ?? 1;
        return (
            <VisualizerMonet
                {...props}
                monetTuning={{
                    ...monetTuning,
                    fontScale: monetTuning.fontScale * lyricsFontScale,
                }}
            />
        );
    },
    renderQuickControls: ({ t, theme, tuning = DEFAULT_MONET_TUNING, onTuningChange }: VisualizerQuickControlsProps<MonetTuning>) => {
        const showDescription = tuning.showDescription;
        const showHanger = tuning.showPortraitDragHanger ?? false;
        return <>
            <QuickControlToggle active={showDescription} theme={theme} label={t('options.monetShowDescription')} onToggle={() => onTuningChange({ showDescription: !showDescription })}><Info size={14} /></QuickControlToggle>
            <QuickControlToggle active={showHanger} theme={theme} label={t('options.monetPortraitDragHanger')} onToggle={() => onTuningChange({ showPortraitDragHanger: !showHanger })}><Grip size={14} /></QuickControlToggle>
            <QuickControlToggle active={tuning.showAudioVisualization} theme={theme} label={t('options.monetShowAudioVisualization')} onToggle={() => onTuningChange({ showAudioVisualization: !tuning.showAudioVisualization })}><AudioLines size={14} /></QuickControlToggle>
        </>;
    },
    renderSettingsPanel: props => <MonetSettingsPanel {...props} />,
});
