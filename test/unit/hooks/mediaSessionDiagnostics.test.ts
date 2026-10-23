// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PlayerState } from '../../../src/types';

// Exercise real Media Session registration and callback boundaries without a native OS media panel.
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
let root: Root | undefined;
let handlers: Map<string, (() => void) | null>;
let failAction = '';
beforeEach(() => {
    vi.resetModules();
    window.history.replaceState({}, '', '/?mediaSessionDebug=1');
    sessionStorage.clear();
    handlers = new Map();
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: {
        setActionHandler: (action: string, handler: (() => void) | null) => {
            if (action === failAction) throw new DOMException('not logged', 'NotSupportedError');
            handlers.set(action, handler);
        },
        setPositionState: vi.fn(), metadata: null,
    } });
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
    act(() => root?.unmount()); root = undefined;
    document.body.innerHTML = '';
    failAction = '';
    vi.restoreAllMocks();
});
const boot = async () => {
    const { useMediaSessionBridge } = await import('../../../src/hooks/useMediaSessionBridge');
    const diagnostics = await import('../../../src/utils/mediaSessionDiagnostics');
    const prev = vi.fn(); const next = vi.fn().mockResolvedValue(undefined);
    const disabled = { current: false };
    const audio = document.createElement('audio');
    const options = {
        audioRef: { current: audio }, audioSrc: null, currentSong: null, cachedCoverUrl: null,
        playerState: PlayerState.IDLE, isNowPlayingStageActive: false, unknownArtistLabel: 'unknown',
        mediaSessionPlayRef: { current: vi.fn().mockResolvedValue(undefined) }, mediaSessionPauseRef: { current: vi.fn() },
        mediaSessionPrevRef: { current: prev }, mediaSessionNextRef: { current: next }, isNowPlayingControlDisabledRef: disabled,
    };
    function Probe() { useMediaSessionBridge(options); return null; }
    root = createRoot(document.body.appendChild(document.createElement('div')));
    act(() => root!.render(createElement(Probe)));
    return { diagnostics, prev, next, disabled, audio };
};
it('does no diagnostic storage or UI work when not explicitly enabled', async () => {
    window.history.replaceState({}, '', '/');
    const { diagnostics } = await boot();
    handlers.get('nexttrack')?.();
    expect(diagnostics.mediaDiagnosticSnapshot()).toEqual([]);
    expect(sessionStorage.length).toBe(0);
    expect(document.querySelector('textarea')).toBeNull();
});
it('records four successful bindings and callback/invocation separately from completion', async () => {
    const { diagnostics, prev, next } = await boot();
    expect(diagnostics.mediaDiagnosticSnapshot().filter(event => event.phase === 'handler.registered' && event.fields.bound).map(event => event.fields.action)).toEqual(['play', 'pause', 'previoustrack', 'nexttrack']);
    handlers.get('previoustrack')?.(); handlers.get('nexttrack')?.();
    expect(prev).toHaveBeenCalledOnce(); expect(next).toHaveBeenCalledOnce();
    const events = diagnostics.mediaDiagnosticSnapshot();
    expect(events.filter(event => event.phase === 'callback.received')).toHaveLength(2);
    expect(events.filter(event => event.phase === 'transport.invoke')).toHaveLength(2);
    expect(events.some(event => /success|completed/.test(event.phase))).toBe(false);
});
it('records a disabled callback without calling transport', async () => {
    const { diagnostics, prev, disabled } = await boot();
    disabled.current = true; handlers.get('previoustrack')?.();
    expect(prev).not.toHaveBeenCalled();
    expect(diagnostics.mediaDiagnosticSnapshot().some(event => event.phase === 'callback.blocked')).toBe(true);
});
it('records registration exceptions and preserves synchronous transport errors', async () => {
    failAction = 'pause'; vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { diagnostics, prev } = await boot();
    prev.mockImplementation(() => { throw new TypeError('private filename must not be captured'); });
    expect(() => handlers.get('previoustrack')?.()).toThrow(TypeError);
    const text = JSON.stringify(diagnostics.mediaDiagnosticSnapshot());
    expect(text).toContain('handler.registration-error.pause'); expect(text).toContain('transport.sync-error');
    expect(text).not.toContain('private filename');
});
it('retains a bounded ring, exposes touch-readable selectable logs and disables cleanly', async () => {
    const { diagnostics, audio } = await boot();
    for (let i = 0; i < 250; i++) diagnostics.recordMediaDiagnostic('sample', { i });
    expect(diagnostics.mediaDiagnosticSnapshot()).toHaveLength(200);
    audio.dispatchEvent(new Event('error'));
    expect(diagnostics.mediaDiagnosticSnapshot().at(-1)?.phase).toBe('audio.error');
    (document.querySelector('button') as HTMLButtonElement).click();
    const output = document.querySelector('textarea')!;
    expect(output.readOnly).toBe(true); expect(output.value).toContain('audio.error');
    const buttons = Array.from(document.querySelectorAll('button'));
    buttons.find(button => button.textContent === 'mediaDiagnostics.select')!.click();
    expect(output.selectionEnd).toBe(output.value.length);
    buttons.find(button => button.textContent === 'mediaDiagnostics.disable')!.click();
    expect(diagnostics.diagnosticsEnabled()).toBe(false);
    expect(sessionStorage.getItem('folia-media-session-diagnostics-v1')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
});
