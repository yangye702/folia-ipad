import React, { type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LATENT_BACKGROUND_TUNING, DEFAULT_MONET_TUNING, DEFAULT_PENDOLO_TUNING, DEFAULT_SONNET_TUNING, type Theme } from '../../../src/types';
import type { VisualizerRegistryEntry } from '../../../src/components/visualizer/definition';
import sonnet from '../../../src/components/visualizer/sonnet/entry';
import pendolo from '../../../src/components/visualizer/pendolo/entry';
import monet from '../../../src/components/visualizer/monet/entry';
import latent from '../../../src/components/visualizer/backgrounds/latent/entry';

vi.mock('../../../src/components/visualizer/sonnet/SonnetSettingsPanel', () => ({ default: () => null }));
vi.mock('../../../src/components/visualizer/pendolo/PendoloSettingsPanel', () => ({ default: () => null }));
vi.mock('../../../src/components/visualizer/monet/MonetSettingsPanel', () => ({ MonetSettingsPanel: () => null }));
vi.mock('../../../src/components/visualizer/backgrounds/latent/LatentBackground', () => ({ default: () => null }));
vi.mock('../../../src/components/visualizer/backgrounds/latent/LatentBackgroundSettingsCard', () => ({ default: () => null }));

// Exercise the registry callbacks without mounting renderers or starting animation loops.
const controls = (node: ReactNode) => React.Children.toArray((node as ReactElement<{ children: ReactNode }>).props.children) as ReactElement<Record<string, any>>[];
const common = { t: (key: string) => key, isDaylight: false, theme: {} as Theme };

describe('mode-owned quick tuning controls', () => {
    it.each<[VisualizerRegistryEntry, any, string, string, Record<string, unknown>]>([
        [sonnet, DEFAULT_SONNET_TUNING, 'options.sonnetOuterFrameMode', 'onClick', { outerFrameMode: 'none' }],
        [sonnet, DEFAULT_SONNET_TUNING, 'options.sonnetPostProcessEnabled', 'onToggle', { postProcessEnabled: !DEFAULT_SONNET_TUNING.postProcessEnabled }],
        [pendolo, DEFAULT_PENDOLO_TUNING, 'options.pendoloShowCoverOnWatchFace', 'onToggle', { showCoverOnWatchFace: !DEFAULT_PENDOLO_TUNING.showCoverOnWatchFace }],
        [monet, DEFAULT_MONET_TUNING, 'options.monetShowDescription', 'onToggle', { showDescription: !DEFAULT_MONET_TUNING.showDescription }],
        [monet, DEFAULT_MONET_TUNING, 'options.monetPortraitDragHanger', 'onToggle', { showPortraitDragHanger: !DEFAULT_MONET_TUNING.showPortraitDragHanger }],
        [monet, DEFAULT_MONET_TUNING, 'options.monetShowAudioVisualization', 'onToggle', { showAudioVisualization: !DEFAULT_MONET_TUNING.showAudioVisualization }],
    ])('saves the requested tuning patch (%#)', (entry, tuning, key, action, expected) => {
        const onTuningChange = vi.fn();
        const items = controls(entry.renderQuickControls!({ ...common, tuning, onTuningChange }));
        const item = items.find(item => String(item.props.title ?? item.props.label).startsWith(key as string));
        expect(item).toBeDefined();
        item!.props[action as string]();
        expect(onTuningChange).toHaveBeenCalledExactlyOnceWith(expected);
    });

    it.each([
        ['none', 'frame'], ['frame', 'full'], ['full', 'none'],
    ] as const)('cycles Sonnet frame %s to %s', (outerFrameMode, next) => {
        const onTuningChange = vi.fn();
        const items = controls(sonnet.renderQuickControls!({ ...common, tuning: { ...DEFAULT_SONNET_TUNING, outerFrameMode }, onTuningChange }));
        items.find(item => item.props.title?.startsWith('options.sonnetOuterFrameMode'))!.props.onClick();
        expect(onTuningChange).toHaveBeenCalledExactlyOnceWith({ outerFrameMode: next });
    });

    it('wraps gear decoration from full to none', () => {
        const onTuningChange = vi.fn();
        const items = controls(pendolo.renderQuickControls!({ ...common, tuning: { ...DEFAULT_PENDOLO_TUNING, showGearDecor: 'full' }, onTuningChange }));
        items.find(item => item.props.title?.startsWith('options.pendoloShowGearDecor'))!.props.onClick();
        expect(onTuningChange).toHaveBeenCalledExactlyOnceWith({ showGearDecor: 'none' });
    });

    it('cycles Latent color sources without altering audio response', () => {
        for (const colorSource of ['cover-theme', 'cover-only'] as const) {
            const onTuningChange = vi.fn();
            const items = controls(latent.renderQuickControls!({ ...common, config: { latent: { tuning: { ...DEFAULT_LATENT_BACKGROUND_TUNING, colorSource } } }, actions: { latent: { onTuningChange } } }));
            items.find(item => item.props.title?.startsWith('options.latentColorSource'))!.props.onClick();
            expect(onTuningChange).toHaveBeenCalledExactlyOnceWith({ colorSource: colorSource === 'cover-only' ? 'cover-theme' : 'cover-only' });
        }
    });
});
