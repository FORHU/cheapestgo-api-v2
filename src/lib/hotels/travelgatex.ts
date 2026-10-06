/**
 * TravelgateX GraphQL client — Express/Node port of the monolith client.
 * Handles auth, GraphQL requests, Quote, Book, and Cancel operations.
 */

import { config } from '@/config';
import { startSupplierAttempt, finishSupplierAttempt } from '@/lib/hotels/supplierAttempt';
import type { TgxCancelPolicy } from '@/types/hotels';

// ─── Config ───────────────────────────────────────────────────────────────────

export function getTgxConfig() {
    return {
        apiKey:     config.TRAVELGATEX_API_KEY   || '',
        accessCode: config.TRAVELGATEX_CODE       || '38327',
        endpoint:   process.env.TRAVELGATE_ENDPOINT_URL || 'https://api.travelgate.com',
        client:     process.env.TRAVELGATE_CLIENT  || 'forhuinc',
        supplier:   process.env.TRAVELGATE_SUPPLIER || 'OTV',
        context:    process.env.TRAVELGATE_CONTEXT  || 'OTV',
    };
}

/**
 * The settings block every TGX call carries, and the plugins that make a search work.
 *
 * The plugins are not an optimisation. Without them a destination search does not merely
 * run slowly, it fails:
 *
 * - **`search_by_destination`** translates a TGX destination code into OTV hotel codes.
 *   Without it TGX answers any destination code with `WRONG_FIELD` / empty hotels, and the
 *   caller falls back to asking for hotel codes in batches of 100 — four waves of up to 22s
 *   each, then a retry of all of them. A Phuket search took 21 to 42 seconds that way, and
 *   put far more load on OTV than one destination call does.
 * - **`cheapest_price`** cuts the response from roughly 16MB to 20KB by returning one option
 *   per hotel instead of every rate. Phuket alone is about 84,000 options; unpruned, the
 *   transfer alone outruns the HTTP abort, which surfaces as `ALL_PROCESSES_FAILED`.
 * - **`currency_exchange`** converts OTV prices, which arrive in the supplier's own currency,
 *   into one the rest of the system can compare. `exclude: false` keeps an option whose
 *   currency is missing from the mapping file rather than hiding it, so an incomplete file
 *   degrades the price rather than the result.
 *
 * @param timeout          The supplier budget, in `settings.timeout`. OTV states 12s for
 *                         Search; TGX caps it at 25s. Sending more than the supplier will
 *                         use buys dead time, not answers.
 * @param withDestPlugins  For a destination-code search. A hotel-code search addresses
 *                         hotels directly and needs no translation.
 * @param targetCurrency   Currency to convert supplier prices into.
 */
export function getTgxSettings(
    cfg = getTgxConfig(),
    timeout = 18000,
    withDestPlugins = false,
    targetCurrency?: string,
) {
    const base = {
        context:           cfg.context,
        client:            cfg.client,
        timeout,
        // Turning the audit trail off is a documented response-time win.
        auditTransactions: false,
    };
    if (!withDestPlugins && !targetCurrency) return base;

    const plugins: object[] = [];

    if (withDestPlugins) {
        plugins.push(
            {
                pluginsType: [{
                    name:       'search_by_destination',
                    parameters: [{ key: 'accessID', value: cfg.accessCode }],
                }],
            },
            {
                pluginsType: [{
                    name:       'cheapest_price',
                    parameters: [
                        { key: 'primaryKey',    value: 'hotel' },
                        { key: 'optionsPerKey', value: '1' },
                    ],
                }],
            },
        );
    }

    if (targetCurrency) {
        plugins.push({
            pluginsType: [{
                name:       'currency_exchange',
                parameters: [
                    { key: 'currency', value: targetCurrency },
                    { key: 'exclude',  value: 'false' },
                ],
            }],
        });
    }

    return { ...base, plugins };
}

// Routes the request to our specific OTV access code per TGX docs.
export function getTgxFilterSearch(cfg = getTgxConfig()) {
    return { access: { includes: [cfg.accessCode] } };
}

// ─── GraphQL client ───────────────────────────────────────────────────────────

/**
 * @param abortMs  How long to wait for the whole HTTP response. This is not the supplier
 *   timeout — that travels in `settings.timeout` and is what OTV itself budgets — it covers
 *   TGX's own overhead and the transfer of the body, so it is always larger. Measured
 *   round-trip against a 15s supplier budget was 17.3s, i.e. ~2.3s of TGX on top.
 */
export async function tgxGraphQL<T = any>(
    query: string,
    variables?: Record<string, any>,
    abortMs = 30_000,
): Promise<T> {
    const cfg = getTgxConfig();
    if (!cfg.apiKey) throw new Error('TRAVELGATEX_API_KEY is not set');

    const payload = JSON.stringify(variables ? { query, variables } : { query });

    if (process.env.NODE_ENV === 'development') {
        console.log('[tgx] → endpoint:', cfg.endpoint);
        console.log('[tgx] variables:', JSON.stringify(variables, null, 2));
    }

    const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: {
            'Authorization':   `Apikey ${cfg.apiKey}`,
            'Content-Type':    'application/json',
            'Accept-Encoding': 'gzip',
        },
        body: payload,
        signal: AbortSignal.timeout(abortMs),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[tgx] HTTP error body:', text.slice(0, 2000));
        throw new Error(`TravelgateX API error ${res.status}: ${text.slice(0, 2000)}`);
    }

    const body: any = await res.json();

    // Every query here asks hotelX for exactly one operation — search, quote, book or
    // cancel — so whichever it was is the only value under it.
    const opResult: any = Object.values(body?.data?.hotelX ?? {})[0] ?? {};

    if (process.env.NODE_ENV === 'development') {
        const optionCount = opResult?.options?.length;
        console.log('[tgx] ← options:', optionCount ?? 'n/a', '| errors:', JSON.stringify(opResult?.errors ?? []));
    }

    // Warnings carry the reason, and they are logged at every log level because the moment
    // you need them is a failure in production. ALL_PROCESSES_FAILED and the rest describe
    // themselves as "See warnings for more information" and say nothing else; without this
    // line there is nothing to see, and the same error means a supplier timeout, a mapping
    // gap or a credential problem with no way to tell which.
    const warnings: any[] = opResult?.warnings ?? [];
    if (warnings.length) {
        console.warn('[tgx] ⚠ warnings:', JSON.stringify(warnings).slice(0, 800));
    }

    if (body.errors?.length) {
        const msg = body.errors.map((e: any) => e.message || JSON.stringify(e)).join('; ');
        throw new Error(`TravelgateX GraphQL errors: ${msg}`);
    }

    return body as T;
}

// ─── Occupancy builder ────────────────────────────────────────────────────────

export function buildOccupancies(adults: number, children = 0, childrenAges: number[] = []) {
    const paxes: { age: number }[] = [];
    for (let i = 0; i < adults; i++) paxes.push({ age: 30 });
    if (childrenAges.length) {
        for (const age of childrenAges) paxes.push({ age });
    } else {
        for (let i = 0; i < children; i++) paxes.push({ age: 10 });
    }
    return [{ paxes }];
}

// ─── TGX Option type ──────────────────────────────────────────────────────────

export interface TgxOption {
    id: string;
    hotelCode: string;
    boardCode: string;
    paymentType: string;
    status: string;
    price: { currency: string; net: number; gross: number };
    token: string;
    rooms?: Array<{
        occupancyRefId: number;
        code: string;
        description: string;
        medias?: Array<{ url: string; type?: string }>;
    }>;
    cancelPolicy?: TgxCancelPolicy;
    surcharges?: Array<{
        chargeType: string;
        mandatory: boolean;
        price: { net: number; gross: number; currency: string };
    }>;
}

/**
 * Canonicalise refundability at the supplier boundary.
 *
 * TGX answers with a boolean; every consumer downstream — the policy normaliser, the
 * cancellation engine, the search filter — tests `'RFN'`. Emitting `'REFUNDABLE'` here
 * instead meant those tests silently failed: a "free cancellation only" filter matched
 * nothing and simply looked like a search with no results. Converting once, here, is
 * why the rest of the codebase can assume one spelling.
 */
export function toRefundableTag(refundable: boolean | null | undefined): 'RFN' | 'NRFN' {
    return refundable ? 'RFN' : 'NRFN';
}

/**
 * The cancellation terms in the shape the client already expects.
 *
 * app-v2's `RoomOption` has declared `cancelPolicy` all along, so the only thing
 * missing was sending it. Two renames happen here rather than on the client, for the
 * same reason `toRefundableTag` exists: the supplier's vocabulary stops at this file.
 * TGX names the figure `value`; the client's shape calls it `amount`. `penaltyType`
 * travels with it because without it a 20% penalty and a 20-unit one are one number.
 */
export function toClientCancelPolicy(policy: TgxCancelPolicy | null | undefined) {
    if (!policy) return undefined;
    return {
        refundable: policy.refundable,
        cancelPenalties: (policy.cancelPenalties ?? []).map(p => ({
            deadline:    p.deadline,
            amount:      p.value,
            currency:    p.currency,
            penaltyType: p.penaltyType,
        })),
    };
}

export function normalizeOption(opt: TgxOption) {
    // TGX docs: id is the canonical identifier that goes to Quote; token is supplier-native.
    const quoteId = opt.id || opt.token;
    return {
        offerId:       `TGX:${quoteId}`,
        roomName:      opt.rooms?.[0]?.description || opt.boardCode || 'Room',
        roomCode:      opt.rooms?.[0]?.code,
        boardCode:     opt.boardCode,
        price:         opt.price.gross || opt.price.net,
        net:           opt.price.net,
        gross:         opt.price.gross,
        currency:      opt.price.currency,
        refundable:    opt.cancelPolicy?.refundable ?? false,
        refundableTag: toRefundableTag(opt.cancelPolicy?.refundable),
        cancelPolicy:  opt.cancelPolicy,
        rates: [{
            retailRate: {
                total:    [{ amount: opt.price.gross || opt.price.net, currency: opt.price.currency }],
                currency: opt.price.currency,
            },
            refundableTag:         toRefundableTag(opt.cancelPolicy?.refundable),
            cancellationPolicies:  opt.cancelPolicy?.cancelPenalties || [],
            _tgx: {
                token:       opt.token,
                id:          opt.id,
                boardCode:   opt.boardCode,
                paymentType: opt.paymentType,
                cancelPolicy: opt.cancelPolicy,
            },
        }],
    };
}

// ─── Quote ────────────────────────────────────────────────────────────────────

const QUOTE_QUERY = `
query TgxQuote($criteria: HotelCriteriaQuoteInput!, $settings: HotelSettingsInput!) {
  hotelX {
    quote(criteria: $criteria, settings: $settings) {
      optionQuote {
        optionRefId
        hotelCode
        boardCode
        paymentType
        status
        price { currency net gross }
        surcharges { chargeType mandatory price { net gross currency } }
        rooms { code description occupancyRefId }
        cancelPolicy {
          refundable
          cancelPenalties { deadline hoursBefore penaltyType currency value }
        }
      }
      errors { code type description }
      warnings { code type description }
    }
  }
}`;

export async function quoteTgx(token: string): Promise<{
    optionRefId: string;
    hotelCode: string;
    boardCode: string;
    paymentType: string;
    status: string;
    price: { net: number; gross: number; currency: string };
    surcharges: any[];
    rooms: any[];
    cancelPolicy?: TgxCancelPolicy;
}> {
    const settings = getTgxSettings();
    const result   = await tgxGraphQL(QUOTE_QUERY, {
        criteria: { optionRefId: token },
        settings,
    });

    const quote  = result?.data?.hotelX?.quote?.optionQuote;
    const errors = result?.data?.hotelX?.quote?.errors || [];

    if (errors.length) {
        const msg = errors.map((e: any) => e.description || e.code).join('; ');
        throw new Error(`TGX Quote errors: ${msg}`);
    }

    if (!quote) throw new Error('No quote returned from TravelgateX');

    return {
        optionRefId:  quote.optionRefId || token,
        hotelCode:    quote.hotelCode,
        boardCode:    quote.boardCode,
        paymentType:  quote.paymentType,
        status:       quote.status,
        price: {
            net:      quote.price?.net      ?? 0,
            gross:    quote.price?.gross    ?? 0,
            currency: quote.price?.currency ?? 'USD',
        },
        surcharges:   quote.surcharges  ?? [],
        rooms:        quote.rooms       ?? [],
        cancelPolicy: quote.cancelPolicy,
    };
}

// ─── Book ─────────────────────────────────────────────────────────────────────

const BOOK_MUTATION = `
mutation TgxBook($input: HotelBookInput!, $settings: HotelSettingsInput!) {
  hotelX {
    book(input: $input, settings: $settings) {
      booking {
        reference { supplier client hotel }
        status
        price { currency net gross }
        hotel { hotelCode hotelName }
        cancelPolicy {
          refundable
          cancelPenalties { deadline hoursBefore penaltyType currency value }
        }
      }
      errors { code type description }
      warnings { code type description }
    }
  }
}`;

export async function bookTgx(params: {
    quoteToken: string;
    clientReference: string;
    holder: { firstName: string; lastName: string; email: string };
    rooms: Array<{
        occupancyRefId: number;
        paxes: Array<{ name: string; surname: string; age: number }>;
    }>;
}) {
    const settings = getTgxSettings();

    const input = {
        optionRefId:     params.quoteToken,
        clientReference: params.clientReference,
        language:        'en',
        deltaPrice:      { percent: 0, applyBoth: false },
        holder: {
            name:    params.holder.firstName.toUpperCase(),
            surname: params.holder.lastName.toUpperCase(),
            contactInfo: { email: params.holder.email },
        },
        rooms: params.rooms.map(r => ({
            occupancyRefId: r.occupancyRefId ?? 1,
            paxes: r.paxes.map(p => ({
                name:    (p.name || '').toUpperCase(),
                surname: (p.surname || '').toUpperCase(),
                age:     p.age ?? 30,
            })),
        })),
    };

    if (process.env.NODE_ENV === 'development') {
        console.log('[tgx-book] input:', JSON.stringify({
            ...input,
            optionRefId: input.optionRefId.slice(0, 60) + '…',
        }, null, 2));
    }

    // Opened before the mutation and closed after, whatever happens. A mutation that times
    // out has still very likely reached OTV, and this is the only record that survives it.
    const attemptId = await startSupplierAttempt({
        provider:        'travelgatex',
        operation:       'book',
        clientReference: params.clientReference,
    });

    try {
        const result  = await tgxGraphQL(BOOK_MUTATION, { input, settings });
        const booking = result?.data?.hotelX?.book?.booking;
        const errors  = result?.data?.hotelX?.book?.errors || [];

        if (errors.length) {
            const msg = errors.map((e: any) => e.description || e.code).join('; ');
            throw new Error(`TGX Book errors: ${msg}`);
        }

        if (!booking) throw new Error('No booking returned from TravelgateX');
        if (booking.status !== 'OK') {
            throw new Error(`Booking not confirmed — status: ${booking.status}`);
        }

        await finishSupplierAttempt(attemptId, {
            status:            'confirmed',
            supplierReference: booking.reference?.supplier,
            hotelCode:         booking.hotel?.hotelCode,
            hotelName:         booking.hotel?.hotelName,
            priceGross:        booking.price?.gross ?? null,
            currency:          booking.price?.currency ?? null,
        });

        return {
            status:      booking.status,
            supplierRef: booking.reference?.supplier as string | undefined,
            clientRef:   booking.reference?.client   as string | undefined,
            hotelRef:    booking.reference?.hotel    as string | undefined,
            hotelCode:   booking.hotel?.hotelCode    as string | undefined,
            hotelName:   booking.hotel?.hotelName    as string | undefined,
            price:       booking.price,
            cancelPolicy: booking.cancelPolicy as TgxCancelPolicy | undefined,
        };
    } catch (err: any) {
        // Closed as failed rather than left open: an open row means "we asked and never
        // found out", and here we did find out.
        await finishSupplierAttempt(attemptId, { status: 'failed', error: err?.message });
        throw err;
    }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

const CANCEL_MUTATION = `
mutation TgxCancel($input: HotelCancelInput!, $settings: HotelSettingsInput!) {
  hotelX {
    cancel(input: $input, settings: $settings) {
      cancellation {
        reference { supplier client hotel }
        status
        price { currency net gross }
      }
      errors { code type description }
      warnings { code type description }
    }
  }
}`;

/**
 * Cancel a TravelgateX reservation.
 *
 * **Addressed by client reference first.** That order is load-bearing, not stylistic: OTV
 * rejects a cancel addressed by supplier reference with "Request not accepted by supplier"
 * while accepting the identical booking by client reference — measured 2026-09-06 on
 * reservation CG-770AZS / supplier 448577296.
 *
 * Every cancellation this platform has completed went by client reference, but only by
 * accident: `bookings.provider_metadata` was double-encoded in v1, so the supplier reference
 * read as undefined and the code fell through to the client branch. Fixing that encoding
 * would have moved every future cancel onto the branch that does not work. api-v2 inherited
 * the supplier-first order without inheriting the accident, so its cancellations would have
 * failed outright. The preference is now explicit, and the supplier reference is a fallback
 * tried only when the client reference is refused.
 */
export async function cancelTgx(params: {
    clientReference?: string;
    supplierReference?: string;
    tgxBookingId?: string;
    hotelCode?: string;
}) {
    const cfg      = getTgxConfig();
    const settings = getTgxSettings(cfg);

    const references: Array<{ label: string; reference: Record<string, string> }> = [];
    if (params.clientReference)   references.push({ label: 'client',   reference: { client:   params.clientReference } });
    if (params.supplierReference) references.push({ label: 'supplier', reference: { supplier: params.supplierReference } });

    // A TGX booking id addresses the reservation directly and needs no reference at all.
    const attempts: Array<{ label: string; input: Record<string, any> }> = params.tgxBookingId
        ? [{ label: 'bookingID', input: { bookingID: params.tgxBookingId } }]
        : references.map(({ label, reference }) => ({
            label,
            input: {
                accessCode: cfg.accessCode,
                ...(params.hotelCode ? { hotelCode: params.hotelCode } : {}),
                reference,
            },
        }));

    if (!attempts.length) throw new Error('No reference supplied to cancel by');

    // One row per cancellation, not per reference attempt: the loop below is a single
    // logical cancellation tried under two addresses. Recorded with more urgency than a
    // book — OTV monitors cancellation rates and has raised them with us, so a
    // cancellation this platform cannot see is one it cannot account for.
    const attemptId = await startSupplierAttempt({
        provider:          'travelgatex',
        operation:         'cancel',
        clientReference:   params.clientReference ?? null,
        supplierReference: params.supplierReference ?? null,
        hotelCode:         params.hotelCode ?? null,
    });

    let cancellation: any = null;
    let lastErrorMsg = '';

    try {
        for (const attempt of attempts) {
            console.log(`[tgx-cancel] attempt=${attempt.label} input:`, JSON.stringify(attempt.input));
            const result = await tgxGraphQL(CANCEL_MUTATION, { input: attempt.input, settings });

            const errors = result?.data?.hotelX?.cancel?.errors || [];
            if (errors.length) {
                lastErrorMsg = errors.map((e: any) => e.description || e.code).join('; ');
                console.warn(`[tgx-cancel] attempt=${attempt.label} rejected: ${lastErrorMsg}`);
                continue;
            }

            const candidate = result?.data?.hotelX?.cancel?.cancellation;
            if (candidate) { cancellation = candidate; break; }
            lastErrorMsg = 'No cancellation returned from TravelgateX';
        }

        if (!cancellation && lastErrorMsg && lastErrorMsg !== 'No cancellation returned from TravelgateX') {
            const alreadyCancelled = lastErrorMsg.toLowerCase().includes('cancel') || lastErrorMsg.toLowerCase().includes('not found');
            throw Object.assign(new Error(lastErrorMsg), { alreadyCancelled });
        }

        if (!cancellation) throw new Error('No cancellation returned from TravelgateX');
        if (cancellation.status !== 'CANCELLED') {
            throw new Error(`Cancellation not confirmed — status: ${cancellation.status}`);
        }

            await finishSupplierAttempt(attemptId, {
                status:            'confirmed',
                supplierReference: cancellation.reference?.supplier,
                priceGross:        cancellation.price?.gross ?? null,
                currency:          cancellation.price?.currency ?? null,
            });

        return {
            status:       cancellation.status as string,
            supplierRef:  cancellation.reference?.supplier as string | undefined,
            clientRef:    cancellation.reference?.client   as string | undefined,
            refundAmount: cancellation.price?.net          ?? 0,
            currency:     cancellation.price?.currency     ?? 'USD',
        };
    } catch (err: any) {
        await finishSupplierAttempt(attemptId, { status: 'failed', error: err?.message });
        throw err;
    }
}

// ─── Amenities ────────────────────────────────────────────────────────────────

const AMENITIES_QUERY = `
query TgxHotelAmenities($criteria: HotelXHotelListInput!) {
  hotelX {
    hotels(criteria: $criteria) {
      edges {
        node {
          hotelData {
            code
            hotelName
            amenities { code }
          }
        }
      }
    }
  }
}`;

export interface HotelAmenityResult {
    hotelId:   string;
    hotelName: string | null;
    amenities: string[];
}

export async function fetchAmenitiesByDestination(
    destinationCode: string,
    maxSize = 200,
): Promise<HotelAmenityResult[]> {
    const cfg    = getTgxConfig();
    const result = await tgxGraphQL(AMENITIES_QUERY, {
        criteria: { access: cfg.accessCode, destinationCodes: [destinationCode], maxSize },
    });

    const edges: any[] = result?.data?.hotelX?.hotels?.edges ?? [];
    return edges.map((e: any) => {
        const d = e?.node?.hotelData;
        return {
            hotelId:   d?.code   ?? '',
            hotelName: d?.hotelName ?? null,
            amenities: (d?.amenities ?? []).map((a: any) => a.code).filter(Boolean),
        };
    }).filter(h => h.hotelId);
}

export async function fetchAmenitiesByHotelCodes(
    hotelCodes: string[],
): Promise<HotelAmenityResult[]> {
    const cfg    = getTgxConfig();
    const result = await tgxGraphQL(AMENITIES_QUERY, {
        criteria: { access: cfg.accessCode, hotelCodes, maxSize: hotelCodes.length },
    });

    const edges: any[] = result?.data?.hotelX?.hotels?.edges ?? [];
    return edges.map((e: any) => {
        const d = e?.node?.hotelData;
        return {
            hotelId:   d?.code   ?? '',
            hotelName: d?.hotelName ?? null,
            amenities: (d?.amenities ?? []).map((a: any) => a.code).filter(Boolean),
        };
    }).filter(h => h.hotelId);
}

// ─── Destination code resolver ────────────────────────────────────────────────

const _destCodeCache = new Map<string, string>();

/** A NONE Sentinel older than this is re-asked. It records only that one destinationSearcher
 *  call failed, and it is written on any TGX 5xx including a transient one: left permanent, a
 *  single outage routes a city to the hotel-code fallback forever at roughly half the
 *  inventory. Mirrors the window tgx_failed_dest_codes already uses. */
const NONE_TTL_DAYS = 7;

/**
 * The country a cached row belongs to, or null when the row cannot say.
 *
 * `parent_code` is either "Country Name#CC" or a numeric parent id. Only the named form
 * identifies a country; `11218` and `-` say nothing, and a row we cannot judge is left
 * alone rather than guessed at.
 */
const rowCountry = (parentCode: string | null | undefined): string | null =>
    /#([A-Z]{2})$/.exec(parentCode ?? '')?.[1] ?? null;

/**
 * @param countryCode  which country the search is for. It is part of the cache key, and it
 *   is what lets a cached row be refused: the unscoped key holds exactly one row per city
 *   name worldwide, and city names collide. Unchecked, "Paris, France" was answered with
 *   code 143485 — Paris, Texas — which TGX honestly reported as having no availability, and
 *   the search then pruned all 300 catalog hotels and rendered "no hotels found". Bali
 *   (Greece) and Rome (United States) failed identically on 2026-09-09.
 */
/**
 * A city name reduced to the letters in it: no spaces, punctuation or accents.
 *
 * The cache is keyed on the exact lowercased name, so "Danang" missed a row stored as
 * "da nang" and the search fell through to the hotel-code path — a portfolio fetch, a
 * chunked supplier search, a three-second wait and the whole thing again. Fifty seconds,
 * for a spelling difference of one space. The same gap swallows "Hochiminh", "Seogwipo si"
 * and every accented name typed without its accents.
 */
function looseCityKey(name: string): string {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function resolveTgxDestinationCode(cityName: string, prisma: any, countryCode?: string): Promise<string | undefined> {
    const cityOnlyKey = cityName.toLowerCase().trim();
    const key = countryCode ? cityOnlyKey + ':' + countryCode.toLowerCase() : cityOnlyKey;

    if (_destCodeCache.has(key)) {
        const cached = _destCodeCache.get(key)!;
        return cached === 'NONE' ? undefined : cached;
    }

    try {
        /**
         * @returns the code, `undefined` for a live NONE Sentinel, or `null` for "keep
         *   looking" — no row, a stale sentinel, or a row belonging to another country.
         * @param requireCountry  set only for the unscoped fallback, whose row may be any
         *   country's.
         */
        const readKey = async (k: string, requireCountry?: string): Promise<string | undefined | null> => {
            const row = await prisma.tgx_destination_cache.findUnique({ where: { city_key: k } });
            if (!row) return null;
            // `NONE` is a sentinel, not a code. Returning it sends the literal string to TGX
            // as a destination. v1 writes these rows and v2 reads the same schema (ADR-0014).
            if (row.destination_code === 'NONE') {
                const age = Date.now() - new Date(row.created_at ?? 0).getTime();
                if (age < NONE_TTL_DAYS * 86_400_000) { _destCodeCache.set(key, 'NONE'); return undefined; }
                return null;
            }
            if (requireCountry) {
                const belongsTo = rowCountry(row.parent_code);
                if (belongsTo && belongsTo !== requireCountry.toUpperCase()) {
                    console.warn(
                        `[dest-resolve] ignoring cached "${k}" → ${row.destination_code} (${belongsTo}); asked for ${requireCountry.toUpperCase()}`,
                    );
                    return null;
                }
            }
            _destCodeCache.set(key, row.destination_code);
            return row.destination_code;
        };

        const hit = await readKey(key);
        if (hit !== null) return hit;
        // The destination-cache sync writes codes without the ":cc" suffix, so a scoped
        // miss checks the city-only key rather than paying for a fresh TGX round-trip.
        if (key !== cityOnlyKey) {
            const cityHit = await readKey(cityOnlyKey, countryCode);
            if (cityHit !== null) return cityHit;
        }

        // Last resort before going to TGX: match on letters alone. Cheap, and it is the
        // difference between a 4-second search and a 50-second one for anyone who types
        // the name without its spaces or accents.
        const loose = looseCityKey(cityOnlyKey);
        // Runs whenever the exact lookups missed, not only when the input itself needed
        // normalising: the stored key is the one that differs. "danang" is already bare, and
        // the row it needs to find is "da nang".
        if (loose) {
            const rows = await prisma.$queryRaw<{ city_key: string; destination_code: string; parent_code: string | null }[]>`
                SELECT city_key, destination_code, parent_code
                FROM tgx_destination_cache
                WHERE regexp_replace(lower(city_key), '[^a-z0-9]', '', 'g') = ${loose}
                  AND destination_code <> 'NONE'
                LIMIT 5
            `.catch(() => []);

            const match = countryCode
                ? rows.find((r: { parent_code: string | null }) => {
                      const belongsTo = rowCountry(r.parent_code);
                      return !belongsTo || belongsTo === countryCode.toUpperCase();
                  })
                : rows[0];

            if (match) {
                console.log(`[dest-resolve] "${cityName}" matched "${match.city_key}" on letters alone → ${match.destination_code}`);
                _destCodeCache.set(key, match.destination_code);
                return match.destination_code;
            }
        }
    } catch { /* non-fatal */ }

    try {
        const cfg     = getTgxConfig();
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('resolve timeout')), 18000)
        );
        const result = await Promise.race([
            tgxGraphQL(
                `query TgxResolveCity($access: ID!, $text: String!, $maxSize: Int) {
                   hotelX {
                     destinationSearcher(criteria: { access: $access, text: $text, maxSize: $maxSize }) {
                       ... on DestinationData { code type texts { text language } }
                     }
                   }
                 }`,
                { access: cfg.accessCode, text: cityName, maxSize: 20 },
            ),
            timeout,
        ]);

        const items = result?.data?.hotelX?.destinationSearcher ?? [];
        const exactName = cityName.toLowerCase();
        const matchesName = (i: any) =>
            (i.texts ?? []).some((t: any) => t.language === 'en' && t.text.toLowerCase() === exactName);

        const cityItem =
            items.find((i: any) => i.type === 'CITY' && matchesName(i)) ??
            items.find((i: any) => i.type === 'CITY');
        const zoneItem =
            items.find((i: any) => i.type === 'ZONE' && matchesName(i)) ??
            items.find((i: any) => i.type === 'ZONE');
        const code = (countryCode ? (zoneItem ?? cityItem) : (cityItem ?? zoneItem))?.code ?? undefined;

        if (code) {
            _destCodeCache.set(key, code);
            prisma.tgx_destination_cache.upsert({
                where:  { city_key: key },
                create: { city_key: key, destination_code: code },
                update: { destination_code: code },
            }).catch(() => {});
        }
        return code;
    } catch {
        return undefined;
    }
}
