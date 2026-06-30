/**
 * TravelgateX GraphQL client — Express/Node port of the monolith client.
 * Handles auth, GraphQL requests, Quote, Book, and Cancel operations.
 */

import { config } from '@/config';
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

export function getTgxSettings(cfg = getTgxConfig(), timeout = 18000) {
    return {
        context:           cfg.context,
        client:            cfg.client,
        timeout,
        auditTransactions: false,
    };
}

// ─── GraphQL client ───────────────────────────────────────────────────────────

export async function tgxGraphQL<T = any>(
    query: string,
    variables?: Record<string, any>,
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
        signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[tgx] HTTP error body:', text.slice(0, 2000));
        throw new Error(`TravelgateX API error ${res.status}: ${text.slice(0, 2000)}`);
    }

    const body: any = await res.json();

    if (process.env.NODE_ENV === 'development') {
        const optionCount = body?.data?.hotelX?.search?.options?.length;
        const errors      = body?.data?.hotelX?.search?.errors;
        console.log('[tgx] ← options:', optionCount ?? 'n/a', '| errors:', JSON.stringify(errors ?? []));
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

export function normalizeOption(opt: TgxOption) {
    const tokenId = opt.token || opt.id;
    return {
        offerId:       `TGX:${tokenId}`,
        roomName:      opt.rooms?.[0]?.description || opt.boardCode || 'Room',
        roomCode:      opt.rooms?.[0]?.code,
        boardCode:     opt.boardCode,
        price:         opt.price.gross || opt.price.net,
        net:           opt.price.net,
        gross:         opt.price.gross,
        currency:      opt.price.currency,
        refundable:    opt.cancelPolicy?.refundable ?? false,
        refundableTag: opt.cancelPolicy?.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
        cancelPolicy:  opt.cancelPolicy,
        rates: [{
            retailRate: {
                total:    [{ amount: opt.price.gross || opt.price.net, currency: opt.price.currency }],
                currency: opt.price.currency,
            },
            refundableTag:         opt.cancelPolicy?.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
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
    }
  }
}`;

export async function cancelTgx(params: {
    clientReference?: string;
    supplierReference?: string;
    tgxBookingId?: string;
    hotelCode?: string;
}) {
    const cfg      = getTgxConfig();
    const settings = getTgxSettings(cfg);

    const input: Record<string, any> = {};
    if (params.tgxBookingId) {
        input.bookingID = params.tgxBookingId;
    } else {
        input.accessCode = cfg.accessCode;
        if (params.hotelCode) input.hotelCode = params.hotelCode;
        if (params.supplierReference) {
            input.reference = { supplier: params.supplierReference };
        } else {
            input.reference = { client: params.clientReference };
        }
    }

    console.log('[tgx-cancel] input:', JSON.stringify(input));
    const result       = await tgxGraphQL(CANCEL_MUTATION, { input, settings });
    const cancellation = result?.data?.hotelX?.cancel?.cancellation;
    const errors       = result?.data?.hotelX?.cancel?.errors || [];

    if (errors.length) {
        const msg = errors.map((e: any) => e.description || e.code).join('; ');
        const alreadyCancelled = msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('not found');
        throw Object.assign(new Error(msg), { alreadyCancelled });
    }

    if (!cancellation) throw new Error('No cancellation returned from TravelgateX');
    if (cancellation.status !== 'CANCELLED') {
        throw new Error(`Cancellation not confirmed — status: ${cancellation.status}`);
    }

    return {
        status:       cancellation.status as string,
        supplierRef:  cancellation.reference?.supplier as string | undefined,
        clientRef:    cancellation.reference?.client   as string | undefined,
        refundAmount: cancellation.price?.net          ?? 0,
        currency:     cancellation.price?.currency     ?? 'USD',
    };
}

// ─── Destination code resolver ────────────────────────────────────────────────

const _destCodeCache = new Map<string, string>();

export async function resolveTgxDestinationCode(cityName: string, prisma: any): Promise<string | undefined> {
    const key = cityName.toLowerCase().trim();

    if (_destCodeCache.has(key)) return _destCodeCache.get(key);

    try {
        const row = await prisma.tgx_destination_cache.findUnique({ where: { city_key: key } });
        if (row?.destination_code) {
            _destCodeCache.set(key, row.destination_code);
            return row.destination_code;
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
                       ... on DestinationData { code type }
                     }
                   }
                 }`,
                { access: cfg.accessCode, text: cityName, maxSize: 20 },
            ),
            timeout,
        ]);

        const items    = result?.data?.hotelX?.destinationSearcher ?? [];
        const cityItem = items.find((i: any) => i.type === 'CITY');
        const zoneItem = items.find((i: any) => i.type === 'ZONE');
        const code     = cityItem?.code ?? zoneItem?.code ?? undefined;

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
