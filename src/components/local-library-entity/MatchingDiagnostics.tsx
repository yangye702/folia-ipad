import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { getMatchBatchSummary, getMatchingDiagnostics, matchingDebugEnabled, subscribeMatchingDiagnostics } from '../../services/matchingDiagnostics';

// Touch-copyable, memory-only evidence; hidden unless the URL explicitly enables matchDebug=1.
export const MatchingDiagnostics = () => {
    const { t } = useTranslation();
    const entries = useSyncExternalStore(subscribeMatchingDiagnostics, getMatchingDiagnostics);
    if (!matchingDebugEnabled()) return null;
    const text = JSON.stringify({ version: 2, batch: getMatchBatchSummary(), events: entries }, null, 2);
    return <details className="rounded-xl border border-current/20 p-3 text-xs">
        <summary className="min-h-11 cursor-pointer">{t('localMusic.matchDiagnostics')}</summary>
        <textarea aria-label={t('localMusic.matchDiagnostics')} readOnly value={text} onFocus={event => event.currentTarget.select()} className="h-36 w-full select-text bg-transparent font-mono" />
        <button type="button" className="min-h-11 rounded-lg border border-current/20 px-4" onClick={() => void navigator.clipboard?.writeText(text).catch(() => undefined)}>{t('localMusic.copyMatchDiagnostics')}</button>
    </details>;
};
