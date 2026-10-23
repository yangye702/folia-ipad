import { useSettingsModalStore } from '../stores/useSettingsModalStore';
import type { NavigationHistoryJournal, NavigationHistoryState } from './navigationHistoryJournal';

// Settings entries extend the existing app history, leaving its base route and collection intact.
let restoring = false;
let pendingClose = false;
let attached = false;

export const restoreSettingsFromHistory = (state: NavigationHistoryState) => {
    pendingClose = false;
    restoring = true;
    try {
        const store = useSettingsModalStore.getState();
        useSettingsModalStore.setState({
            settingsModalState: state.settings?.modal ?? { ...store.settingsModalState, isOpen: false },
            settingsPage: state.settings?.page ?? null,
        });
    } finally {
        restoring = false;
    }
};

/** Return from a nested settings sheet using the same entry as browser Back. */
export const backSettingsPage = (): boolean => {
    const state = window.history.state as NavigationHistoryState | null;
    if (!attached || !state?.settings || state.appHistoryIndex <= state.settings.baseIndex + 1) return false;
    if (!pendingClose) {
        pendingClose = true;
        window.history.back();
    }
    return true;
};

/** Attach once with the app router. Coalesce a settings event's state updates into one entry. */
export const bindSettingsNavigationHistory = (journal: NavigationHistoryJournal) => {
    attached = true;
    let alive = true;
    let scheduled = false;
    const unsubscribe = useSettingsModalStore.subscribe((next, previous) => {
        if (restoring || pendingClose || (next.settingsModalState === previous.settingsModalState && next.settingsPage === previous.settingsPage)) return;
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            if (!alive || restoring || pendingClose) return;
            const store = useSettingsModalStore.getState();
            const current = window.history.state as NavigationHistoryState | null;
            if (!current?.view) return;
            if (!store.settingsModalState.isOpen) {
                if (current.settings) {
                    pendingClose = true;
                    window.history.go(current.settings.baseIndex - current.appHistoryIndex);
                }
                return;
            }
            const settings = {
                modal: store.settingsModalState,
                page: store.settingsPage,
                baseIndex: current.settings?.baseIndex ?? current.appHistoryIndex,
            };
            if (JSON.stringify(current.settings) === JSON.stringify(settings)) return;
            // The window computes its initial page after mounting. Fill that root snapshot in place.
            const replace = Boolean(current.settings && current.settings.page === null
                && JSON.stringify(current.settings.modal) === JSON.stringify(settings.modal));
            const state: NavigationHistoryState = {
                ...current,
                appHistoryIndex: current.appHistoryIndex + (replace ? 0 : 1),
                settings,
            };
            journal.observe(current);
            if (replace) window.history.replaceState(state, '');
            else window.history.pushState(state, '');
            journal.record(state, replace ? 'replace' : 'push');
        });
    });
    return () => {
        alive = false;
        attached = false;
        pendingClose = false;
        unsubscribe();
    };
};
