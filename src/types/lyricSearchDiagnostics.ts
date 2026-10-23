// Optional read-only diagnostics exposed by a lyric source; UI owns rendering and touch copying.
export interface LyricSearchDiagnostics {
    enabled(): boolean;
    subscribe(listener: () => void): () => void;
    getSnapshot(): readonly unknown[];
    titleKey: string;
    hintKey: string;
    copyKey: string;
    selectKey: string;
}
