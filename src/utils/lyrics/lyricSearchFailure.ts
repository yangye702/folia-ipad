// Providers may attach a safe translation key without teaching the shared matching window their rules.
export class LyricSearchFailure extends Error {
    constructor(message: string, public readonly searchFailureMessageKey: string) { super(message); }
}
