import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { packSearchForCache, unpackSearchFromCache } from '@/lib/hotels/search';

/**
 * What may be remembered from a hotel search, and what must never be. See ADR-0005.
 *
 * These are the rules, not the Redis call. The machine this is written on cannot reach the
 * supplier (ADR-0002) and the deployed Redis is not reachable from a test, so the two lines
 * that talk to Redis are left thin on purpose and everything that can quietly do damage lives
 * here where it can be asserted.
 *
 * The damage in question: a partial or empty answer stored as a complete one is then served to
 * everybody for five minutes, and nothing on any screen looks wrong.
 */
const answer = (over: Record<string, unknown> = {}) => ({
    data: [{ hotelId: '1', name: 'A' }],
    allMappable: [],
    totalCount: 1,
    ...over,
}) as any;

describe('what gets remembered', () => {
    it('a real answer is stored, compressed', () => {
        const packed = packSearchForCache(answer())!;
        expect(packed).toBeInstanceOf(Buffer);
        // gzip magic. This Redis also holds OAuth sign-in state, and 1.26 MB of JSON per
        // search is what would crowd it out.
        expect(packed[0]).toBe(0x1f);
        expect(packed[1]).toBe(0x8b);
    });

    it('comes back exactly as it went in', () => {
        const original = answer({ data: [{ hotelId: '7', name: 'Shilla', price: 1631.5 }] });
        expect(unpackSearchFromCache(packSearchForCache(original)!)).toEqual(original);
    });

    it('is meaningfully smaller than the JSON', () => {
        const big = answer({
            data: Array.from({ length: 500 }, (_, i) => ({
                hotelId: String(i), name: `Hotel ${i}`, address: '111, Somewhere-daero, Gangnam-gu',
            })),
        });
        const json = Buffer.byteLength(JSON.stringify(big));
        expect(packSearchForCache(big)!.length).toBeLessThan(json / 4);
    });
});

describe('what is refused', () => {
    it('an empty answer, because a quiet supplier failure looks the same', () => {
        // Five minutes of "no hotels in Seoul" from one bad call is the expensive mistake.
        expect(packSearchForCache(answer({ data: [], totalCount: 0 }))).toBeNull();
    });

    it('a truncated answer, because an incomplete answer is not an answer', () => {
        expect(packSearchForCache(answer({ truncated: true }))).toBeNull();
    });

    it('anything without results at all', () => {
        expect(packSearchForCache({} as any)).toBeNull();
    });
});

describe('an unreadable value means ask the supplier', () => {
    it('garbage', () => {
        expect(unpackSearchFromCache(Buffer.from('not gzip at all'))).toBeNull();
    });

    it('nothing stored', () => {
        expect(unpackSearchFromCache(null)).toBeNull();
        expect(unpackSearchFromCache(Buffer.alloc(0))).toBeNull();
    });

    it('a value written by an older deploy, before compression', () => {
        // Two containers mid-rollout can disagree about the format. A slow answer is always
        // better than a wrong one, so the old shape reads as a miss rather than throwing.
        expect(unpackSearchFromCache(Buffer.from(JSON.stringify(answer())))).toBeNull();
    });

    it('gzip of something that is not a search result', () => {
        expect(unpackSearchFromCache(gzipSync(Buffer.from('{"nope":1}')))).toBeNull();
    });
});
