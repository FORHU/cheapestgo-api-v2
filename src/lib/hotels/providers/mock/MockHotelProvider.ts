// src/lib/hotels/providers/mock/MockHotelProvider.ts
/**
 * A hotel supplier that exists only in this process.
 *
 * It is deterministic — the same query always gives the same answer — and it fails on demand:
 * see `scenarios.ts`. It never touches the network, the database or a credential, which is the
 * point of it: the whole booking flow can be exercised, by a test or by a person in the
 * browser, without a supplier being asked anything.
 *
 * It is deliberately a *naive* supplier. A second `book` with a client reference it has already
 * seen makes a second reservation, because a double-submit bug in the flow should be visible as
 * two reservations rather than hidden by a forgiving fake.
 */

import type { HotelListing, HotelSearchParams, HotelSearchResult, RoomType } from '@/types/hotels';
import { nightsBetween } from '@/lib/hotels/nights';
import {
    HotelProviderError,
    type BookInput,
    type CancelInput,
    type CancellationTerms,
    type HotelContent,
    type HotelProvider,
    type PrebookInput,
    type PrebookResult,
    type ProviderBooking,
    type ProviderBookingRef,
    type ProviderCancellation,
    type ProviderCapabilities,
    type StayQuery,
} from '../types';
import {
    MOCK_HOTELS,
    MOCK_RATE_PLANS,
    MOCK_ROOM_TYPES,
    mockImages,
    type MockHotel,
    type MockRatePlan,
    type MockRoomType,
} from './catalog';
import { MOCK_DEFAULT_CURRENCY, addDays, mockSupportsCurrency, roundMoney, stayTotal } from './pricing';
import type { MockScenario } from './scenarios';

const PREFIX = 'MOCK:';

const UNAVAILABLE_MESSAGE =
    'This room is currently unavailable for booking. Please try a different hotel or check back later.';

export interface MockHotelProviderOptions {
    /** Forces one scenario on every hotel. Beats a hotel's own. */
    scenario?:          MockScenario;
    /** What the supplier quotes in. Defaults to USD, which exercises the FX path. */
    currency?:          string;
    /** The clock, so cancellation windows are testable. */
    now?:               () => number;
    /** A real supplier may or may not refuse a repeated client reference; the default is "does not". */
    dedupeByClientRef?: boolean;
}

interface BaseRef {
    v:   1;
    h:   string;   // hotel id
    r:   string;   // room code
    p:   string;   // rate plan code
    in:  string;   // check-in
    out: string;   // check-out
    a:   number;   // adults
    c:   number;   // children
    cur: string;   // currency
}
interface OfferRef   extends BaseRef { k: 'offer' }
interface PrebookRef extends BaseRef { k: 'prebook'; net: number; gross: number }

interface Reservation {
    clientRef:   string;
    supplierRef: string;
    ref:         PrebookRef;
    status:      'OK' | 'CANCELLED';
}

function encode(ref: OfferRef | PrebookRef): string {
    return PREFIX + Buffer.from(JSON.stringify(ref)).toString('base64url');
}

function decode<T extends OfferRef | PrebookRef>(value: string, kind: T['k']): T | null {
    if (!value.startsWith(PREFIX)) return null;
    try {
        const parsed = JSON.parse(Buffer.from(value.slice(PREFIX.length), 'base64url').toString('utf8'));
        return parsed && parsed.v === 1 && parsed.k === kind ? (parsed as T) : null;
    } catch {
        return null;
    }
}

function normalise(text: string): string {
    return text.split(',')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(bLat - aLat);
    const dLng = rad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function hashOf(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
}

export class MockHotelProvider implements HotelProvider {
    readonly id           = 'mock' as const;
    readonly displayName  = 'the mock supplier';
    readonly capabilities: ProviderCapabilities = { bookingRead: true, providesContent: true };

    /** Every call made, in order. A test asserts a supplier was asked exactly once from this. */
    readonly calls: Array<{ method: string; input: unknown }> = [];

    private readonly store = new Map<string, Reservation>();
    private sequence = 0;
    private override: MockScenario | undefined;

    private readonly currency: string;
    private readonly now: () => number;

    constructor(private readonly options: MockHotelProviderOptions = {}) {
        const wanted = options.currency?.toUpperCase();
        this.currency = wanted && mockSupportsCurrency(wanted) ? wanted : MOCK_DEFAULT_CURRENCY;
        this.now = options.now ?? Date.now;
    }

    // ── Test controls ───────────────────────────────────────────────────────

    /** Forces a scenario on every hotel until `reset()`. */
    setScenario(scenario: MockScenario | undefined): void {
        this.override = scenario;
    }

    /** Every reservation held, cancelled ones included. */
    get reservations(): ProviderBooking[] {
        return [...this.store.values()].map((r) => this.toBooking(r));
    }

    reset(): void {
        this.store.clear();
        this.calls.length = 0;
        this.sequence = 0;
        this.override = undefined;
    }

    // ── HotelProvider ───────────────────────────────────────────────────────

    ownsRef(ref: string): boolean {
        return typeof ref === 'string' && ref.startsWith(PREFIX);
    }

    async searchHotels(q: HotelSearchParams): Promise<HotelSearchResult> {
        this.record('searchHotels', q);

        const stay = this.stayOf({
            checkIn: q.checkin, checkOut: q.checkout, adults: q.adults ?? 2, children: q.children ?? 0,
        });
        const nights = nightsBetween(stay.checkIn, stay.checkOut);

        const data: HotelListing[] = this.matchHotels(q).flatMap((hotel) => {
            const rates = this.ratesFor(hotel, stay);
            if (!rates.length) return [];
            const cheapest = rates.reduce((a, b) => (b.gross < a.gross ? b : a));
            return [this.toListing(hotel, cheapest, roundMoney(cheapest.gross / nights, this.currency))];
        });

        return { data, allMappable: data.filter((h) => h.lat && h.lng), totalCount: data.length };
    }

    async getHotelDetails(hotelId: string): Promise<HotelContent | null> {
        this.record('getHotelDetails', { hotelId });
        const hotel = MOCK_HOTELS.find((h) => h.id === hotelId);
        if (!hotel) return null;
        return {
            hotelId:      hotel.id,
            name:         hotel.name,
            address:      hotel.address,
            city:         hotel.city,
            country:      'PH',
            lat:          hotel.lat,
            lng:          hotel.lng,
            starRating:   hotel.stars,
            description:  hotel.description,
            images:       mockImages(hotel.id),
            amenities:    [...hotel.amenities],
            checkInTime:  hotel.checkInTime,
            checkOutTime: hotel.checkOutTime,
        };
    }

    async getRates(hotelId: string, stay: StayQuery): Promise<RoomType[]> {
        this.record('getRates', { hotelId, stay });
        const hotel = MOCK_HOTELS.find((h) => h.id === hotelId);
        if (!hotel) return [];
        return this.ratesFor(hotel, this.stayOf(stay));
    }

    async prebook(input: PrebookInput): Promise<PrebookResult> {
        this.record('prebook', input);

        if (!this.ownsRef(input.offerId)) {
            throw new HotelProviderError('INVALID_RATE', 'This hotel is not available for instant online booking.', { provider: 'mock' });
        }
        const ref = decode<OfferRef>(input.offerId, 'offer');
        const hotel = ref && MOCK_HOTELS.find((h) => h.id === ref.h);
        const room  = ref && MOCK_ROOM_TYPES.find((r) => r.code === ref.r);
        const plan  = ref && MOCK_RATE_PLANS.find((p) => p.code === ref.p);
        if (!ref || !hotel || !room || !plan) {
            throw new HotelProviderError('INVALID_RATE', 'Invalid mock offer id — could not decode hotel details', { provider: 'mock' });
        }

        const scenario = this.scenarioFor(hotel);
        if (scenario === 'prebook_timeout') {
            throw new HotelProviderError('TIMEOUT', 'The mock supplier did not answer in time.', { provider: 'mock' });
        }
        if (scenario === 'sold_out') {
            throw new HotelProviderError('SOLD_OUT', UNAVAILABLE_MESSAGE, { provider: 'mock' });
        }

        const listed = stayTotal({
            hotel, room, plan, checkIn: ref.in, checkOut: ref.out, adults: ref.a, children: ref.c, currency: ref.cur,
        });
        const factor = scenario === 'price_up' ? 1.08 : scenario === 'price_down' ? 0.95 : 1;
        const gross  = roundMoney(listed * factor, ref.cur);
        const net    = roundMoney(gross * 0.9, ref.cur);

        const prebookRef = encode({ ...ref, k: 'prebook', net, gross });
        const terms = this.termsFor(plan, ref.in, gross, ref.cur, ref.in, ref.out);

        return {
            prebookRef,
            checkIn:         ref.in,
            checkOut:        ref.out,
            roomName:        room.name,
            roomSubstituted: input.roomName ? normalise(input.roomName) !== normalise(room.name) : false,
            price:           { net, gross, currency: ref.cur },
            surcharges:      [],
            cancellation:    terms,
            boardCode:       plan.boardCode,
            rooms:           [{ code: room.code, description: room.name, occupancyRefId: 1 }],
        };
    }

    async book(input: BookInput): Promise<ProviderBooking> {
        this.record('book', input);

        const ref   = this.ownsRef(input.prebookRef) ? decode<PrebookRef>(input.prebookRef, 'prebook') : null;
        const hotel = ref && MOCK_HOTELS.find((h) => h.id === ref.h);
        if (!ref || !hotel) {
            throw new HotelProviderError('INVALID_RATE', 'Invalid mock prebook reference', { provider: 'mock' });
        }
        if (!input.guests.length) {
            throw new HotelProviderError('REJECTED', 'At least one guest is required', { provider: 'mock' });
        }

        const scenario = this.scenarioFor(hotel);
        if (scenario === 'book_rejected') {
            throw new HotelProviderError('REJECTED', 'The mock supplier refused the booking.', { provider: 'mock' });
        }

        if (this.options.dedupeByClientRef) {
            const existing = this.findByClientRef(input.clientRef);
            if (existing) return this.toBooking(existing);
        }

        const reservation: Reservation = {
            clientRef:   input.clientRef,
            supplierRef: `MOCKSUP-${String(++this.sequence).padStart(6, '0')}`,
            ref,
            status:      'OK',
        };
        this.store.set(reservation.supplierRef, reservation);

        if (scenario === 'book_timeout') {
            // The reservation is made; only the answer is lost.
            throw new HotelProviderError('UNKNOWN_OUTCOME', 'The mock supplier did not answer in time.', { provider: 'mock' });
        }
        return this.toBooking(reservation);
    }

    async getBooking(ref: ProviderBookingRef): Promise<ProviderBooking | null> {
        this.record('getBooking', ref);
        const found = (ref.supplierRef && this.store.get(ref.supplierRef))
            || (ref.clientRef ? this.findByClientRef(ref.clientRef) : undefined);
        return found ? this.toBooking(found) : null;
    }

    async cancelBooking(input: CancelInput): Promise<ProviderCancellation> {
        this.record('cancelBooking', input);

        const found = (input.supplierRef && this.store.get(input.supplierRef))
            || (input.clientRef ? this.findByClientRef(input.clientRef) : undefined);
        if (!found) {
            throw new HotelProviderError('REJECTED', 'Booking not found', { provider: 'mock' });
        }
        if (found.status === 'CANCELLED') {
            throw new HotelProviderError('REJECTED', 'Booking is already cancelled', { provider: 'mock' });
        }

        const hotel = MOCK_HOTELS.find((h) => h.id === found.ref.h);
        const scenario = this.scenarioFor(hotel);
        if (scenario === 'cancel_rejected') {
            throw new HotelProviderError('REJECTED', 'The mock supplier will not cancel this booking.', { provider: 'mock' });
        }

        found.status = 'CANCELLED';
        if (scenario === 'cancel_timeout') {
            throw new HotelProviderError('UNKNOWN_OUTCOME', 'The mock supplier did not answer in time.', { provider: 'mock' });
        }

        const plan  = MOCK_RATE_PLANS.find((p) => p.code === found.ref.p);
        const terms = plan
            ? this.termsFor(plan, found.ref.in, found.ref.gross, found.ref.cur, found.ref.in, found.ref.out)
            : { refundable: false, penalties: [] };

        return {
            status:       'CANCELLED',
            clientRef:    found.clientRef,
            supplierRef:  found.supplierRef,
            refundAmount: this.refundFor(terms, found.ref.gross, found.ref.cur),
            currency:     found.ref.cur,
        };
    }

    // ── Internals ───────────────────────────────────────────────────────────

    private record(method: string, input: unknown): void {
        this.calls.push({ method, input });
    }

    private scenarioFor(hotel?: MockHotel): MockScenario {
        return this.override ?? this.options.scenario ?? hotel?.scenario ?? 'ok';
    }

    private findByClientRef(clientRef: string): Reservation | undefined {
        return [...this.store.values()].find((r) => r.clientRef === clientRef);
    }

    /** Missing dates default to a stay a month out, so a bare hotel lookup still quotes something. */
    private stayOf(s: { checkIn?: string; checkOut?: string; adults?: number; children?: number }): StayQuery {
        const checkIn  = s.checkIn  || addDays(new Date(this.now()).toISOString().slice(0, 10), 30);
        const checkOut = s.checkOut || addDays(checkIn, 2);
        return { checkIn, checkOut, adults: s.adults ?? 2, children: s.children ?? 0 };
    }

    private matchHotels(q: HotelSearchParams): MockHotel[] {
        if (q.hotelCode) return MOCK_HOTELS.filter((h) => h.id === String(q.hotelCode));

        // A typed term matches a known name when it is that name, contains it ("makati city hall"),
        // or is the start of it ("bonifacio" → "bonifacio global city"). It is deliberately not
        // matched *inside* a name: "manila" is a substring of "metro manila", and treating that as
        // a hit made a search for the city return the whole region.
        const term = normalise(q.cityName ?? '');
        const byName = term
            ? MOCK_HOTELS.filter((h) => h.terms.some((t) => t === term || (term.length >= 3 && (term.includes(t) || t.startsWith(term)))))
            : [];

        let matched: readonly MockHotel[] = byName;
        if (!matched.length && typeof q.lat === 'number' && typeof q.lng === 'number') {
            matched = MOCK_HOTELS.filter((h) => distanceKm(q.lat as number, q.lng as number, h.lat, h.lng) <= 30);
        }

        if (Array.isArray(q.bbox) && q.bbox.length === 4) {
            const [minLng, minLat, maxLng, maxLat] = q.bbox;
            matched = matched.filter((h) => h.lng >= minLng && h.lng <= maxLng && h.lat >= minLat && h.lat <= maxLat);
        }
        return [...matched];
    }

    /** Every room × plan the party fits and the star rating allows, as flat rate options. */
    private ratesFor(hotel: MockHotel, stay: StayQuery): RoomType[] {
        const out: RoomType[] = [];
        for (const room of MOCK_ROOM_TYPES) {
            if (stay.adults > room.maxAdults) continue;
            for (const plan of MOCK_RATE_PLANS) {
                if (hotel.stars < plan.minStars) continue;
                out.push(this.toRoomType(hotel, room, plan, stay));
            }
        }
        return out;
    }

    private toRoomType(hotel: MockHotel, room: MockRoomType, plan: MockRatePlan, stay: StayQuery): RoomType {
        const currency = this.currency;
        const gross = stayTotal({
            hotel, room, plan, checkIn: stay.checkIn, checkOut: stay.checkOut,
            adults: stay.adults, children: stay.children, currency,
        });
        const net   = roundMoney(gross * 0.9, currency);
        const terms = this.termsFor(plan, stay.checkIn, gross, currency, stay.checkIn, stay.checkOut);
        const penalties = terms.penalties.map((p) => ({
            deadline: p.deadline, hoursBefore: p.hoursBefore ?? 0, penaltyType: p.type, currency: p.currency, value: p.value,
        }));
        const refundableTag = terms.refundable ? 'RFN' : 'NRFN';

        return {
            offerId: encode({
                v: 1, k: 'offer', h: hotel.id, r: room.code, p: plan.code,
                in: stay.checkIn, out: stay.checkOut, a: stay.adults, c: stay.children, cur: currency,
            }),
            roomName:      room.name,
            roomCode:      room.code,
            boardCode:     plan.boardCode,
            price:         gross,
            net,
            gross,
            currency,
            refundable:    terms.refundable,
            refundableTag,
            cancelPolicy:  { refundable: terms.refundable, cancelPenalties: penalties },
            rates: [{
                retailRate: { total: [{ amount: gross, currency }], currency },
                refundableTag,
                cancellationPolicies: penalties,
            }],
        };
    }

    private toListing(hotel: MockHotel, cheapest: RoomType, nightly: number): HotelListing {
        const h = hashOf(hotel.id);
        const rating = Math.round((7.5 + (h % 20) / 10) * 10) / 10;
        const reviews = 40 + (h % 860);
        const images = mockImages(hotel.id);
        return {
            hotelId:       hotel.id,
            id:            hotel.id,
            name:          hotel.name,
            price:         nightly,
            currency:      cheapest.currency,
            offerId:       cheapest.offerId,
            refundableTag: cheapest.refundableTag,
            starRating:    hotel.stars,
            images:        images.slice(0, 1),
            image:         images[0],
            lat:           hotel.lat,
            lng:           hotel.lng,
            coordinates:   { lat: hotel.lat, lng: hotel.lng },
            address:       hotel.address,
            location:      hotel.address,
            city:          hotel.city,
            country:       'PH',
            description:   hotel.description,
            amenities:     [...hotel.amenities],
            reviewRating:  rating,
            rating,
            reviews,
            reviewCount:   reviews,
            checkInTime:   hotel.checkInTime,
            checkOutTime:  hotel.checkOutTime,
            boardCode:     cheapest.boardCode,
            roomTypes:     [cheapest],
            provider:      'mock',
        };
    }

    /**
     * What cancelling costs, as the plan defines it. Deadlines are 18:00 in Manila (10:00Z) on
     * the day, so a "3 days before" penalty starts at 10:00Z three days before check-in.
     */
    private termsFor(
        plan: MockRatePlan, checkIn: string, gross: number, currency: string, from: string, to: string,
    ): CancellationTerms {
        const at = (daysBefore: number) =>
            new Date(Date.parse(`${checkIn}T10:00:00Z`) - daysBefore * 86_400_000).toISOString();
        const nightly = roundMoney(gross / nightsBetween(from, to), currency);

        switch (plan.policy) {
            case 'non_refundable':
                return { refundable: false, penalties: [] };
            case 'free_until_3d':
                return {
                    refundable: this.now() < Date.parse(at(3)),
                    penalties: [
                        { deadline: at(3), type: 'AMOUNT', value: nightly, currency, hoursBefore: 72 },
                        { deadline: at(1), type: 'AMOUNT', value: gross,   currency, hoursBefore: 24 },
                    ],
                };
            case 'tiered':
                return {
                    refundable: this.now() < Date.parse(at(7)),
                    penalties: [
                        { deadline: at(7), type: 'PERCENT', value: 50,  currency, hoursBefore: 168 },
                        { deadline: at(1), type: 'PERCENT', value: 100, currency, hoursBefore: 24 },
                    ],
                };
        }
    }

    /** The penalty in force now is the last one whose deadline has passed; before the first, none. */
    private refundFor(terms: CancellationTerms, gross: number, currency: string): number {
        const now = this.now();
        const inForce = [...terms.penalties]
            .filter((p) => Date.parse(p.deadline) <= now)
            .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))
            .pop();

        // No penalty has started: free if the rate was ever refundable, otherwise nothing.
        if (!inForce) return terms.penalties.length || terms.refundable ? gross : 0;

        const penalty = inForce.type === 'PERCENT' ? (gross * inForce.value) / 100 : inForce.value;
        return Math.max(0, roundMoney(gross - penalty, currency));
    }

    private toBooking(r: Reservation): ProviderBooking {
        const hotel = MOCK_HOTELS.find((h) => h.id === r.ref.h);
        const plan  = MOCK_RATE_PLANS.find((p) => p.code === r.ref.p);
        return {
            provider:     'mock',
            status:       r.status,
            clientRef:    r.clientRef,
            supplierRef:  r.supplierRef,
            hotelCode:    r.ref.h,
            hotelName:    hotel?.name,
            price:        { net: r.ref.net, gross: r.ref.gross, currency: r.ref.cur },
            cancellation: plan
                ? this.termsFor(plan, r.ref.in, r.ref.gross, r.ref.cur, r.ref.in, r.ref.out)
                : null,
        };
    }
}
