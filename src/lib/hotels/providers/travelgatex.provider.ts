// src/lib/hotels/providers/travelgatex.provider.ts
/**
 * TravelgateX (OTV) behind the provider contract.
 *
 * Everything supplier-specific that used to sit in `HotelsService` lives here: the option token
 * that encodes hotel, dates and nationality, the fresh search that has to precede a quote, the
 * pause OTV needs before an option can be valued, the several tokens one option can be quoted
 * under, and the retry when an option expired between prebook and book.
 *
 * It calls the existing functions with the arguments the service used to pass, so nothing in
 * `lib/hotels/search.ts` or `lib/hotels/travelgatex.ts` changes.
 */

import { runTgxSearch } from '@/lib/hotels/search';
import { quoteTgx, bookTgx, cancelTgx } from '@/lib/hotels/travelgatex';
import { nightsBetween } from '@/lib/hotels/nights';
import type { TgxCancelPolicy } from '@/types/hotels';
import {
    HotelProviderError,
    type BookInput,
    type CancelInput,
    type CancellationTerms,
    type HotelContent,
    type HotelProvider,
    type HotelSearchParams,
    type HotelSearchResult,
    type PrebookInput,
    type PrebookResult,
    type ProviderBooking,
    type ProviderCancellation,
    type ProviderCapabilities,
    type RoomType,
    type StayQuery,
} from './types';

const PREFIX = 'TGX:';

export interface TravelgateXProviderOptions {
    /** OTV needs a moment to propagate a freshly searched option into its valuation cache. */
    propagationDelayMs?: number;
    /** The same, before re-quoting an option that expired between prebook and book. */
    retryDelayMs?: number;
}

// ─── Helpers lifted from the service ──────────────────────────────────────────

/** An option token is a run of one-letter-keyed segments: `d` hotel, `b` in, `c` out, `h` nationality. */
export function parseTgxOptionToken(token: string): {
    hotelCode: string | null; checkIn: string | null; checkOut: string | null; nationality: string;
} {
    const segs: Record<string, string> = {};
    const separator = token.includes('!~|') ? '!~|' : '[';
    for (const seg of token.split(separator)) {
        if (seg.length > 1) segs[seg[0]] = seg.slice(1);
    }
    const parseYYMMDD = (v?: string): string | null => {
        if (!v || v.length !== 6) return null;
        return `20${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
    };
    return {
        hotelCode:   segs['d'] || null,
        checkIn:     parseYYMMDD(segs['b']),
        checkOut:    parseYYMMDD(segs['c']),
        nationality: segs['h'] || 'US',
    };
}

export function roomNamesMatch(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return false;
    if (na === nb || na.includes(nb) || nb.includes(na)) return true;
    const stopWords = new Set(['room', 'type', 'bed', 'with', 'and', 'the', 'for']);
    const wordsA = na.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
    const wordsB = new Set(nb.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w)));
    return wordsA.filter((w) => wordsB.has(w)).length >= 2;
}

function termsFromTgx(policy: TgxCancelPolicy | null | undefined): CancellationTerms | null {
    if (!policy) return null;
    return {
        refundable: policy.refundable ?? false,
        penalties: (policy.cancelPenalties ?? []).map((p) => ({
            deadline:    p.deadline,
            type:        p.penaltyType || 'AMOUNT',
            value:       p.value ?? 0,
            currency:    p.currency,
            hoursBefore: p.hoursBefore,
        })),
    };
}

// ─── Failure classification ───────────────────────────────────────────────────

const VANISHED_OPTION = /option not found|not found in|expired|unavailable|301|wrong_field/i;
const TIMED_OUT = /TimeoutError|AbortError|timed out|timeout|ETIMEDOUT|ECONNRESET|socket hang up|fetch failed|UND_ERR/i;

/**
 * Says what a TravelgateX failure means for the booking flow.
 *
 * `mutating` is the line that matters: a read that failed changed nothing, so it is safe to
 * retry; a booking or cancellation that failed *ambiguously* may have been done, and calling it a
 * refusal is how a guest ends up holding a room we refunded (ADR-0013, ADR-0026).
 *
 * Order is load-bearing. HTTP status and transport come first, so a 503 whose body happens to
 * say "unavailable" is not taken for a vanished option.
 */
export function classifyTgxFailure(
    err: unknown,
    mutating: boolean,
    fallbackMessage = 'Supplier request failed',
): HotelProviderError {
    if (err instanceof HotelProviderError) return err;

    const e = err as { name?: string; message?: string; cause?: { code?: string; name?: string } } | null | undefined;
    const message = e?.message || fallbackMessage;
    const meta = { provider: 'travelgatex' as const, cause: err };

    const http = /^TravelgateX API error (\d{3})/.exec(message);
    if (http) {
        const status = Number(http[1]);
        if (status >= 500 || status === 429) {
            return new HotelProviderError(mutating ? 'UNKNOWN_OUTCOME' : 'UNAVAILABLE', message, meta);
        }
        return new HotelProviderError(mutating ? 'REJECTED' : 'UNAVAILABLE', message, meta);
    }

    const transport = `${e?.name ?? ''} ${message} ${e?.cause?.code ?? ''} ${e?.cause?.name ?? ''}`;
    if (TIMED_OUT.test(transport)) {
        return new HotelProviderError(mutating ? 'UNKNOWN_OUTCOME' : 'TIMEOUT', message, meta);
    }

    const status = /Booking not confirmed — status: (\w+)/.exec(message)?.[1];
    if (status) {
        // ON_REQUEST means the hotel may still confirm; anything else is a refusal.
        return new HotelProviderError(/^(ON_?REQUEST|PENDING)$/i.test(status) ? 'UNKNOWN_OUTCOME' : 'REJECTED', message, meta);
    }

    if (VANISHED_OPTION.test(message)) {
        return new HotelProviderError('SOLD_OUT', message, meta);
    }

    if (/^TGX (Book|Quote|Cancel) errors:|^TravelgateX GraphQL errors:/i.test(message)) {
        return new HotelProviderError('REJECTED', message, meta);
    }

    return new HotelProviderError(mutating ? 'UNKNOWN_OUTCOME' : 'UNAVAILABLE', message, meta);
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

// ─── The provider ─────────────────────────────────────────────────────────────

export class TravelgateXProvider implements HotelProvider {
    readonly id           = 'travelgatex' as const;
    readonly displayName  = 'TravelgateX';
    readonly capabilities: ProviderCapabilities = { bookingRead: false, providesContent: false };

    private readonly propagationDelayMs: number;
    private readonly retryDelayMs: number;

    constructor(options: TravelgateXProviderOptions = {}) {
        this.propagationDelayMs = options.propagationDelayMs ?? 3000;
        this.retryDelayMs       = options.retryDelayMs ?? 1500;
    }

    ownsRef(ref: string): boolean {
        return typeof ref === 'string' && ref.startsWith(PREFIX);
    }

    /**
     * Listings arrive priced per night for TravelgateX results, which `search.ts` divides at the
     * source. ETG-sourced listings (province and country searches) arrive as stay totals, so they
     * are divided here — once, at the boundary — which is what lets every caller treat a
     * listing's price as the Nightly Rate without asking where it came from (ADR-0020).
     */
    async searchHotels(q: HotelSearchParams): Promise<HotelSearchResult> {
        const result = await runTgxSearch(q);
        const nights = nightsBetween(q.checkin, q.checkout);

        const perNight = (h: { provider?: string; price?: number }) =>
            h.provider === 'etg' ? { ...h, price: (h.price ?? 0) / nights } : h;

        return {
            ...result,
            data: Array.isArray(result.data) ? result.data.map(perNight) : result.data,
            ...(result.allMappable ? { allMappable: result.allMappable.map(perNight) } : {}),
        };
    }

    async getHotelDetails(_hotelId: string): Promise<HotelContent | null> {
        return null;
    }

    async getRates(hotelId: string, stay: StayQuery): Promise<RoomType[]> {
        const result = await runTgxSearch({
            hotelCode:         hotelId,
            checkin:           stay.checkIn,
            checkout:          stay.checkOut,
            adults:            stay.adults,
            children:          stay.children,
            currency:          stay.currency ?? 'USD',
            guest_nationality: stay.nationality ?? 'US',
        });
        return result?.data?.[0]?.roomTypes ?? [];
    }

    async prebook(input: PrebookInput): Promise<PrebookResult> {
        if (!this.ownsRef(input.offerId)) {
            throw new HotelProviderError('INVALID_RATE', 'This hotel is not available for instant online booking.', { provider: 'travelgatex' });
        }

        const staleToken = input.offerId.slice(PREFIX.length);
        const { hotelCode, checkIn, checkOut, nationality } = parseTgxOptionToken(staleToken);
        if (!hotelCode || !checkIn || !checkOut) {
            throw new HotelProviderError('INVALID_RATE', 'Invalid TGX offer ID — could not decode hotel details', { provider: 'travelgatex' });
        }

        console.log(`[prebook/tgx] Fresh search: hotel=${hotelCode} ${checkIn}→${checkOut} adults=${input.adults}`);
        let fresh: HotelSearchResult;
        try {
            fresh = await runTgxSearch({
                hotelCode,
                checkin:  checkIn,
                checkout: checkOut,
                adults:   input.adults,
                children: input.children,
                currency: input.currency,
                guest_nationality: nationality,
            });
        } catch (err) {
            throw classifyTgxFailure(err, false);
        }

        const freshRooms: any[] = fresh?.data?.[0]?.roomTypes || [];
        if (!freshRooms.length) {
            throw new HotelProviderError('SOLD_OUT', 'Room is no longer available for the selected dates', { provider: 'travelgatex' });
        }

        const wanted = input.roomName || '';
        const matched = wanted ? freshRooms.filter((r) => roomNamesMatch(r.roomName || r.roomType || '', wanted)) : [];
        const others  = wanted ? freshRooms.filter((r) => !roomNamesMatch(r.roomName || r.roomType || '', wanted)) : freshRooms;
        const candidates = [...matched, ...others].slice(0, 5);

        if (!candidates.length) {
            throw new HotelProviderError('SOLD_OUT', 'Room is no longer available for the selected dates', { provider: 'travelgatex' });
        }

        await sleep(this.propagationDelayMs);

        let optionQuote: Awaited<ReturnType<typeof quoteTgx>> | null = null;
        let quotedToken    = candidates[0]?.offerId?.slice(PREFIX.length) ?? staleToken;
        let successfulRoom = candidates[0];

        for (const room of candidates) {
            const offerId: string = room?.offerId || '';
            if (!offerId.startsWith(PREFIX)) continue;
            const optionId    = offerId.slice(PREFIX.length);
            const tgxId       = room?.rates?.[0]?._tgx?.id    || '';
            const nativeToken = room?.rates?.[0]?._tgx?.token || '';
            const tokensToTry = [...new Set([optionId, tgxId, nativeToken].filter(Boolean))];

            for (const token of tokensToTry) {
                console.log('[prebook/tgx] Quoting with token:', token.substring(0, 80));
                try {
                    optionQuote    = await quoteTgx(token);
                    quotedToken    = token;
                    successfulRoom = room;
                    break;
                } catch (e: any) {
                    console.warn('[prebook/tgx] Quote failed:', token.substring(0, 40), '—', e.message?.substring(0, 100));
                }
            }
            if (optionQuote) break;
        }

        if (!optionQuote) {
            throw new HotelProviderError(
                'SOLD_OUT',
                'This room is currently unavailable for booking. Please try a different hotel or check back later.',
                { provider: 'travelgatex' },
            );
        }

        if (optionQuote.paymentType && optionQuote.paymentType !== 'MERCHANT') {
            throw new HotelProviderError(
                'NOT_PAYABLE_ONLINE',
                'This room is not available for online payment. Please contact support.',
                { provider: 'travelgatex' },
            );
        }

        const bookToken      = optionQuote.optionRefId || quotedToken;
        const bookedRoomName = successfulRoom?.roomName || successfulRoom?.roomType || '';

        console.log(
            `[prebook/tgx] Success | book token: ${bookToken.substring(0, 60)} | room: ${bookedRoomName} | `
            + `price: ${optionQuote.price?.gross || optionQuote.price?.net} ${optionQuote.price?.currency}`,
        );

        return {
            prebookRef:      `${PREFIX}${bookToken}`,
            checkIn,
            checkOut,
            roomName:        bookedRoomName,
            roomSubstituted: wanted ? !roomNamesMatch(bookedRoomName, wanted) : false,
            price: {
                net:      optionQuote.price?.net   || 0,
                gross:    optionQuote.price?.gross || optionQuote.price?.net || 0,
                currency: optionQuote.price?.currency || input.currency,
            },
            surcharges:   optionQuote.surcharges || [],
            cancellation: termsFromTgx(optionQuote.cancelPolicy),
            boardCode:    optionQuote.boardCode || '',
            rooms:        optionQuote.rooms || [],
        };
    }

    async book(input: BookInput): Promise<ProviderBooking> {
        const quoteToken = input.prebookRef.startsWith(PREFIX) ? input.prebookRef.slice(PREFIX.length) : input.prebookRef;
        const holder = { firstName: input.holder.firstName, lastName: input.holder.lastName, email: input.holder.email };
        const rooms = [{
            occupancyRefId: 1,
            paxes: input.guests.map((g) => ({ name: g.firstName, surname: g.lastName, age: g.age })),
        }];

        try {
            return this.toBooking(await bookTgx({ quoteToken, clientReference: input.clientRef, holder, rooms }));
        } catch (firstErr) {
            const first = classifyTgxFailure(firstErr, true);
            // Only a vanished option is worth re-quoting. Anything else may have reached the supplier.
            if (first.code !== 'SOLD_OUT') throw first;
            console.log('[confirm] Token expired, retrying with fresh search...');
            return this.rebookWithFreshOption(quoteToken, input, holder, rooms);
        }
    }

    // `getBooking` is intentionally absent: TravelgateX cannot read a reservation back (ADR-0026).

    async cancelBooking(input: CancelInput): Promise<ProviderCancellation> {
        try {
            const r = await cancelTgx({
                clientReference:   input.clientRef,
                supplierReference: input.supplierRef,
                hotelCode:         input.hotelCode,
            });
            return {
                status:       'CANCELLED',
                supplierRef:  r.supplierRef,
                clientRef:    r.clientRef,
                refundAmount: r.refundAmount,
                currency:     r.currency,
            };
        } catch (err) {
            throw classifyTgxFailure(err, true, 'Cancellation failed');
        }
    }

    // ── Internals ───────────────────────────────────────────────────────────

    private async rebookWithFreshOption(
        staleToken: string,
        input: BookInput,
        holder: { firstName: string; lastName: string; email: string },
        rooms: Array<{ occupancyRefId: number; paxes: Array<{ name: string; surname: string; age: number }> }>,
    ): Promise<ProviderBooking> {
        const gone = () => new HotelProviderError('SOLD_OUT', 'Room is no longer available for these dates', { provider: 'travelgatex' });

        const { hotelCode, checkIn, checkOut, nationality } = parseTgxOptionToken(staleToken);
        if (!hotelCode || !checkIn || !checkOut) throw gone();

        const fresh = await runTgxSearch({
            hotelCode,
            checkin:  checkIn,
            checkout: checkOut,
            adults:   input.stay.adults,
            children: input.stay.children,
            currency: input.stay.currency,
            guest_nationality: nationality,
        }).catch(() => null);

        const freshRoom = fresh?.data?.[0]?.roomTypes?.[0];
        const freshOfferId: string = freshRoom?.offerId || '';
        if (!freshOfferId.startsWith(PREFIX)) throw gone();

        const freshOptionId = freshOfferId.slice(PREFIX.length);
        const freshNative   = freshRoom?.rates?.[0]?._tgx?.token || freshOptionId;

        await sleep(this.retryDelayMs);

        let freshToken: string | null = null;
        for (const token of [...new Set([freshNative, freshOptionId])]) {
            try {
                const q = await quoteTgx(token);
                freshToken = q.optionRefId || token;
                break;
            } catch { /* try the next token */ }
        }
        if (!freshToken) throw gone();

        try {
            return this.toBooking(await bookTgx({
                quoteToken: freshToken, clientReference: input.clientRef, holder, rooms,
            }));
        } catch (retryErr) {
            throw classifyTgxFailure(retryErr, true, 'TravelgateX booking failed after retry');
        }
    }

    private toBooking(b: Awaited<ReturnType<typeof bookTgx>>): ProviderBooking {
        return {
            provider:     'travelgatex',
            status:       b.status,
            clientRef:    b.clientRef,
            supplierRef:  b.supplierRef,
            hotelRef:     b.hotelRef,
            hotelCode:    b.hotelCode,
            hotelName:    b.hotelName,
            price:        b.price ? { net: b.price.net, gross: b.price.gross, currency: b.price.currency } : undefined,
            cancellation: termsFromTgx(b.cancelPolicy),
        };
    }
}
