import React, { useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { getLyricSourceAccess } from '../../../utils/lyrics/lyricMatchSources';
import type { LyricProviderSource } from '../../../types';

// Touch-readable opt-in summaries supplied by the current source; provider details stay in its adapter.
const empty: readonly unknown[] = [];
const emptySnapshot = () => empty;
const noSubscription = () => () => {};
export function SourceSearchDiagnostics({ source }: { source: LyricProviderSource }) {
    const config = getLyricSourceAccess(source).diagnostics;
    const { t } = useTranslation();
    const entries = useSyncExternalStore(config?.subscribe ?? noSubscription, config?.getSnapshot ?? emptySnapshot, config?.getSnapshot ?? emptySnapshot);
    const output = useRef<HTMLTextAreaElement>(null);
    if (!config?.enabled()) return null;
    const text = JSON.stringify({ version: 1, requests: entries }, null, 2);
    const select = () => {
        output.current?.focus(); output.current?.select();
        output.current?.setSelectionRange(0, text.length);
    };
    return <details className="mt-3 rounded-xl border border-current/20 p-2 text-xs">
        <summary className="min-h-11 cursor-pointer py-3">{t(config.titleKey)}</summary>
        <p className="mb-2">{t(config.hintKey)}</p>
        <div className="flex gap-2">
            <button type="button" className="min-h-11 rounded-lg border border-current/20 px-3" onClick={() => {
                select();
                void navigator.clipboard?.writeText(text).catch(() => {});
            }}>{t(config.copyKey)}</button>
            <button type="button" className="min-h-11 rounded-lg border border-current/20 px-3" onClick={select}>{t(config.selectKey)}</button>
        </div>
        <textarea ref={output} aria-label={t(config.titleKey)} readOnly value={text}
            className="mt-2 h-48 w-full select-text rounded bg-black/10 p-2 font-mono text-xs" style={{ WebkitUserSelect: 'text' }} />
    </details>;
}
