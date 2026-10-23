import React from 'react';
import AppearanceSection from '../../src/components/panelTab/controls/AppearanceSection';
import { useVisualizerSettingsStore } from '../../src/stores/useVisualizerSettingsStore';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import { settingsTokens } from '../../src/components/modal/settings/kit/kitTheme';
import type { ProbeDefinition } from './definition';

// The real player appearance panel at an iPad side-panel width, using registered persisted actions.
function Probe() {
    const mode = useVisualizerSettingsStore(state => state.visualizerMode);
    const settings = useVisualizerSettingsStore();
    return <div className="min-h-screen p-4 text-white" style={settingsTokens(false, DEFAULT_THEME)}>
        <div className="mb-4 flex gap-2">{(['sonnet', 'pendolo', 'monet'] as const).map(value => <button className="min-h-11 rounded bg-white/20 px-3" key={value} onClick={() => settings.handleSetVisualizerMode(value)}>{value}</button>)}</div>
        <div data-phase1-appearance className="w-[340px] max-w-full">
            <AppearanceSection theme={DEFAULT_THEME} onThemeChange={() => {}} isDaylight={false} visualizerMode={mode} onVisualizerModeChange={settings.handleSetVisualizerMode} useCoverColorBg={false} onToggleCoverColorBg={() => {}} transparentPlayerBackground={false} onToggleTransparentPlayerBackground={() => {}} />
        </div>
        <output data-phase1-tuning>{JSON.stringify({ sonnet: settings.sonnetTuning, pendolo: settings.pendoloTuning, monet: settings.monetTuning, latent: settings.latentBackgroundTuning })}</output>
    </div>;
}
export default { id: 'ipadAppearanceControls', title: 'iPad appearance controls', description: 'Existing mode settings through the player quick controls.', Component: Probe } satisfies ProbeDefinition;
