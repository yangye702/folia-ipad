// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindSettingsNavigationHistory, restoreSettingsFromHistory, backSettingsPage } from '@/hooks/settingsNavigationHistory';
import { APP_HISTORY_SESSION, createNavigationHistoryJournal, type NavigationHistoryState } from '@/hooks/navigationHistoryJournal';
import { useSettingsModalStore, type SettingsPageSnapshot } from '@/stores/useSettingsModalStore';

// Real store actions and history serialization; traversal itself is verified in browser tests.
const base: NavigationHistoryState = {
    view: 'player', appHistoryIndex: 3, appHistorySession: APP_HISTORY_SESSION,
    search: { query: 'retained query', sourceTab: 'local', returnView: 'home' }, collection: null,
};
const page: SettingsPageSnapshot = { tab: 'options', section: 'lyrics', subview: null };
let unbind: () => void;
beforeEach(() => {
    window.history.replaceState(base, '', '#player');
    restoreSettingsFromHistory(base);
    unbind = bindSettingsNavigationHistory(createNavigationHistoryJournal());
});
afterEach(() => { unbind(); vi.restoreAllMocks(); });
const flush = async () => { await Promise.resolve(); };

describe('settings navigation history', () => {
    it('adds one layer retaining the exact underlying search/view and fills initial page in place', async () => {
        useSettingsModalStore.getState().openSettings('options');
        await flush();
        expect(window.history.state).toMatchObject({ ...base, appHistoryIndex: 4, settings: { baseIndex: 3 } });
        useSettingsModalStore.getState().setSettingsPage(page);
        await flush();
        expect(window.history.state.appHistoryIndex).toBe(4);
        expect(window.history.state.settings.page).toEqual(page);
    });
    it('coalesces all route fields changed by a single settings action', async () => {
        useSettingsModalStore.getState().openSettings('options');
        useSettingsModalStore.getState().setSettingsPage(page);
        await flush();
        const push = vi.spyOn(window.history, 'pushState');
        useSettingsModalStore.getState().setSettingsPage({ ...page, section: 'appearance' });
        useSettingsModalStore.getState().setSettingsPage({ ...page, section: 'appearance', subview: 'themePark' });
        await flush();
        expect(push).toHaveBeenCalledTimes(1);
        expect(window.history.state.settings.page).toEqual({ ...page, section: 'appearance', subview: 'themePark' });
    });
    it('restores Back/Forward snapshots without writing new history entries', async () => {
        useSettingsModalStore.getState().openSettings('options');
        useSettingsModalStore.getState().setSettingsPage(page);
        await flush();
        const opened = window.history.state;
        const push = vi.spyOn(window.history, 'pushState');
        restoreSettingsFromHistory(base);
        expect(useSettingsModalStore.getState().settingsModalState.isOpen).toBe(false);
        restoreSettingsFromHistory(opened);
        await flush();
        expect(useSettingsModalStore.getState().settingsPage).toEqual(page);
        expect(useSettingsModalStore.getState().settingsModalState.isOpen).toBe(true);
        expect(push).not.toHaveBeenCalled();
    });
    it('closes all nested settings entries once; a repeated close cannot pop the base page', async () => {
        useSettingsModalStore.getState().openSettings('options');
        useSettingsModalStore.getState().setSettingsPage(page);
        await flush();
        useSettingsModalStore.getState().setSettingsPage({ ...page, subview: 'lyricFilter' });
        await flush();
        const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
        useSettingsModalStore.getState().closeSettings();
        await flush();
        useSettingsModalStore.getState().closeSettings();
        await flush();
        expect(go).toHaveBeenCalledExactlyOnceWith(-2);
    });
    it('nested touch return requests one Back and direct entry leaves closing to its owner', async () => {
        useSettingsModalStore.getState().openSettings('options');
        useSettingsModalStore.getState().setSettingsPage(page);
        await flush();
        expect(backSettingsPage()).toBe(false);
        useSettingsModalStore.getState().setSettingsPage({ ...page, subview: 'lyricFilter' });
        await flush();
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        expect(backSettingsPage()).toBe(true);
        expect(backSettingsPage()).toBe(true);
        expect(back).toHaveBeenCalledTimes(1);
    });
});
