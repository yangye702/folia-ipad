import { describe, expect, it } from 'vitest';
import { isAutomaticMetadataCandidateReliable } from '@/services/metadataMatchPolicy';
import type { OnlineMetadataCandidate } from '@/services/onlineMetadataSearchService';
// Synthetic identity cases, independent of platform availability.
const target = { title: '幸福不远', artist: '郭书瑶', album: 'Honey', durationMs: 200000 };
const make = (patch = {}) => {
    const raw = { id: 1, name: target.title, artists: [{ name: target.artist }], album: { name: target.album }, durationMs: target.durationMs, ...patch };
    return { title: raw.name, durationMs: raw.durationMs, raw } as OnlineMetadataCandidate;
};
describe('automatic metadata identity', () => {
    it.each(['Live', '伴奏', 'Remix', 'Cover', 'Remastered'])('rejects an unrequested %s version', version => {
        expect(isAutomaticMetadataCandidateReliable(target, make({ name: `幸福不远 (${version})` }))).toBe(false);
    });
    it('accepts script equivalents', () => expect(isAutomaticMetadataCandidateReliable(target, make({ name: '幸福不遠' }))).toBe(true));
    it('rejects another singer even with identical title, album and duration', () => expect(isAutomaticMetadataCandidateReliable(target, make({ artists: [{ name: '其他歌手' }] }))).toBe(false));
    it('rejects a large duration difference', () => expect(isAutomaticMetadataCandidateReliable(target, make({ durationMs: 240000 }))).toBe(false));
    it('never replaces a known album with another release even when duration is close', () => {
        const result = make({ album: { name: 'Other Release' } });
        expect(isAutomaticMetadataCandidateReliable(target, result, 'metadata')).toBe(false);
        expect(isAutomaticMetadataCandidateReliable(target, result, 'cover')).toBe(false);
    });
    it('rejects reordered title characters even when the fuzzy score is high', () => {
        expect(isAutomaticMetadataCandidateReliable({ ...target, title: 'ABCD' }, make({ name: 'DCBA' }))).toBe(false);
    });
    it('does not infer identity from a title alone when artist and album are absent', () => {
        expect(isAutomaticMetadataCandidateReliable({ ...target, artist: '', album: '' }, make())).toBe(false);
    });
});
