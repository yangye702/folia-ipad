import { useLayoutEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useSettingsModalStore, type SettingsPageSnapshot } from '../../../../stores/useSettingsModalStore';
import { backSettingsPage } from '../../../../hooks/settingsNavigationHistory';

// One ephemeral route for the existing settings controls; stand-alone probes retain local ownership.
export const useSettingsPageNavigation = (initial: SettingsPageSnapshot) => {
    const [localPage, setLocalPage] = useState(initial);
    const storedPage = useSettingsModalStore(state => state.settingsPage);
    const isOpen = useSettingsModalStore(state => state.settingsModalState.isOpen);
    const page = isOpen ? storedPage ?? initial : localPage;
    useLayoutEffect(() => {
        if (isOpen && storedPage === null) useSettingsModalStore.getState().setSettingsPage(initial);
    }, [isOpen, storedPage, initial]);

    const update = (apply: (current: SettingsPageSnapshot) => SettingsPageSnapshot) => {
        const store = useSettingsModalStore.getState();
        if (store.settingsModalState.isOpen) store.setSettingsPage(apply(store.settingsPage ?? initial));
        else setLocalPage(apply);
    };
    const field = <K extends 'tab' | 'section'>(key: K): Dispatch<SetStateAction<SettingsPageSnapshot[K]>> => value => {
        update(current => ({ ...current, [key]: typeof value === 'function' ? value(current[key]) : value }));
    };
    const subview = (name: NonNullable<SettingsPageSnapshot['subview']>): Dispatch<SetStateAction<boolean>> => value => {
        const current = useSettingsModalStore.getState().settingsPage ?? page;
        const open = typeof value === 'function' ? value(current.subview === name) : value;
        if (!open && current.subview !== name) return;
        if (!open && backSettingsPage()) return;
        update(route => ({ ...route, subview: open ? name : null }));
    };
    return { page, setTab: field('tab'), setSection: field('section'), subview };
};
