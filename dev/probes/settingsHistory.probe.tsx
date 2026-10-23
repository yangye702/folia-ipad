import React from 'react';
import { useAppNavigation } from '../../src/hooks/useAppNavigation';
import { useSettingsModalStore } from '../../src/stores/useSettingsModalStore';
import { useSettingsPageNavigation } from '../../src/components/modal/settings/navigation/useSettingsPageNavigation';
import type { ProbeDefinition } from './definition';

// Real app history and settings actions without media/network initialization.
const SettingsPage = () => {
    const { page, setSection, subview } = useSettingsPageNavigation({ tab: 'options', section: 'appearance', subview: null });
    return <section role="dialog" aria-label="Settings probe">
        <output data-testid="settings-page">{page.section}/{page.subview ?? 'root'}</output>
        <button onClick={() => setSection('lyrics')}>Lyrics page</button>
        <button onClick={() => subview('globalLyricOffset')(true)}>Nested page</button>
        <button onClick={() => subview('globalLyricOffset')(false)}>Return to settings</button>
        <button onClick={() => useSettingsModalStore.getState().closeSettings()}>Close settings</button>
    </section>;
};
const SettingsHistoryProbe = () => {
    const navigation = useAppNavigation();
    const settings = useSettingsModalStore(state => state.settingsModalState);
    return <>
        <output data-testid="view">{navigation.currentView}</output>
        <button onClick={() => navigation.navigateToPlayer()}>Player</button>
        <button onClick={() => navigation.navigateToSearch({ query: 'retained search', sourceTab: 'local' })}>Search</button>
        <button onClick={() => navigation.navigateToCollection({ source: 'local', type: 'album', id: 'fixture-album', name: 'Fixture album', songIds: [] }, 'search')}>Collection</button>
        <button onClick={() => useSettingsModalStore.getState().openSettings('options')}>Open settings</button>
        {settings.isOpen && <SettingsPage />}
    </>;
};
export default { id: 'settingsHistory', title: 'Settings history', description: 'Browser traversal and settings store integration.', Component: SettingsHistoryProbe } satisfies ProbeDefinition;
