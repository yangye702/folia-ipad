import React, { useState } from 'react';
import CommandPalette from '../../src/components/command-palette/CommandPalette';
import type { CommandPaletteContext } from '../../src/components/command-palette/types';
import PageHeader from '../../src/components/modal/settings/kit/PageHeader';
import { settingsTokens } from '../../src/components/modal/settings/kit/kitTheme';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import Sheet from '../../src/components/shared/Sheet';
import type { ProbeDefinition } from './definition';

// Real modal headers with local open/close state, without playback, persistence or mod setup.
const noop = () => {};
const noCommand = async () => false;
const context = { scope: {} } as CommandPaletteContext;

function Probe() {
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    return <div className="min-h-screen bg-zinc-950 text-white" style={settingsTokens(false, DEFAULT_THEME)}>
        <button onClick={() => setPaletteOpen(true)}>Open palette</button>
        <button onClick={() => setSettingsOpen(true)}>Open settings header</button>
        <button onClick={() => setSheetOpen(true)}>Open sheet</button>
        <CommandPalette activeIndex={0} activePreview={null} activeCommand={null} availableCommands={[]}
            context={context} isDaylight={false} isComposing={false} isExecuting={false} isOpen={paletteOpen}
            matches={[]} pinnedCommands={[]} query="" theme={DEFAULT_THEME}
            onActiveCommandChange={noop} onActiveIndexChange={noop} onClose={() => setPaletteOpen(false)}
            onCompositionEnd={noop} onCompositionStart={noop} onExecuteActive={noCommand}
            onExecuteMatch={noCommand} onExecutePinnedCommand={noCommand} onQueryChange={noop} onQueryCommit={noop} />
        {settingsOpen && <div className="fixed inset-0 flex items-center justify-center px-4 py-8 sm:px-5 sm:py-12">
            <div className="st-window h-[90vh] w-full rounded-2xl bg-[var(--st-win)] md:h-[86vh] md:w-[960px]">
                <PageHeader title="Settings" contents={[]} activeId={null} onSelect={noop}
                    closeLabel="Close" onClose={() => setSettingsOpen(false)} />
            </div>
        </div>}
        <Sheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Test sheet" isDaylight={false}>
            <p>Shared dialog content</p>
        </Sheet>
    </div>;
}

export default { id: 'ipadModalTargets', title: 'iPad modal targets', description: 'Hit testing real palette and settings header controls.', Component: Probe } satisfies ProbeDefinition;
