/**
 * ETG's `metapolicy_struct`, turned into the sections the room-detail modal draws.
 *
 * RateHawk sends the hotel's own house policies as a fixed set of typed groups
 * — what a cot costs, whether pets are allowed, how big a deposit is taken —
 * and the RateHawk API Addendum §10(b) requires us to disclose them. The raw
 * shape is not drawable: fourteen keys of loosely-typed enums, most of them
 * empty on any given hotel, with prices as decimal strings and "unspecified"
 * standing in for most answers.
 *
 * Out comes `DetailSection[]` scoped `property` — the shape app-v2's
 * `propertySections` prop has been waiting on — plus the hotel's free-text
 * tail for its `additionalInfo`.
 *
 * Deliberately *not* here: any attempt to reduce this to a single "no-show
 * penalty" or "early departure fee" number. v1 has functions that try, reading
 * `cancelPolicyInfos` off a LiteAPI-shaped blob — a shape TravelgateX never
 * sends, so those paths are dead in v1 too. ETG's `no_show` is not a price at
 * all: it carries a *time*, the hour past which a guest counts as a no-show.
 * There is no fee in it to extract, and inventing one would be the worse error
 * under a disclosure obligation. See docs/adr/0025 — a port carries v1's rules,
 * not v1's supplier shapes.
 */

import type { DetailItem, DetailSection, IconId, SectionId } from '@/lib/hotels/roomContent.types';

export interface Metapolicy {
    sections: DetailSection[];
    /** `metapolicy_extra_info` — free text the hotel wrote itself. */
    additionalInfo?: string;
}

type Inclusion = 'included' | 'charged' | 'available' | 'not_available' | 'unspecified';

interface GroupSpec {
    /** The heading this group is filed under. Several groups share one. */
    section: SectionId;
    /** How one row of the group is named — singular, since each row is one fact. */
    label: string;
    icon?: IconId;
}

/**
 * Every group ETG can send, in the order a guest wants them: what the stay will
 * take off a card first, then what you may bring, then the extras.
 *
 * `SectionId` is a closed union the design accounts for, and it is shorter than
 * this list, so groups merge — deposit, parking, pets and the rest all land
 * under `general`, each as its own row.
 */
const GROUPS: Array<[string, GroupSpec]> = [
    ['deposit',            { section: 'general',        label: 'Deposit',                          icon: 'safe'  }],
    ['parking',            { section: 'general',        label: 'Parking'                                         }],
    ['pets',               { section: 'general',        label: 'Pets'                                            }],
    ['shuttle',            { section: 'general',        label: 'Shuttle'                                         }],
    ['check_in_check_out', { section: 'general',        label: 'Early check-in / late check-out'                 }],
    ['add_fee',            { section: 'general',        label: 'Additional fee'                                  }],
    ['no_show',            { section: 'general',        label: 'No-show'                                         }],
    ['visa',               { section: 'general',        label: 'Visa support'                                    }],
    ['extra_bed',          { section: 'beds-extra',     label: 'Extra bed',                        icon: 'bed'   }],
    ['cot',                { section: 'beds-extra',     label: 'Cot',                              icon: 'child' }],
    ['children',           { section: 'child-policy',   label: 'Children',                         icon: 'child' }],
    ['children_meal',      { section: 'child-policy',   label: "Children's meal",                  icon: 'child' }],
    ['meal',               { section: 'food-drink',     label: 'Meal',                             icon: 'coffee'}],
    ['internet',           { section: 'internet-comms', label: 'Internet',                         icon: 'wifi'  }],
];

/** Section headings, in the order the modal stacks them. */
const SECTIONS: Array<[SectionId, string]> = [
    ['general',         'Hotel policies'],
    ['beds-extra',      'Cribs and extra beds'],
    ['child-policy',    'Children'],
    ['food-drink',      'Meals'],
    ['internet-comms',  'Internet'],
];

/** ETG enums read as `snake_case`; a few do not survive a naive unslug. */
const ENUM_WORDS: Record<string, string> = {
    on_side:         'on site',
    off_side:        'off site',
    early_check_in:  'early check-in',
    late_check_out:  'late check-out',
    one_way:         'one way',
    // ETG sends the plural. Both spellings map to the word a guest uses.
    two_way:         'return',
    two_ways:        'return',
    support_enable:  'available',
    support_disable: 'not available',
};

/** How a price is charged, worded. */
const UNIT_WORDS: Record<string, string> = {
    per_guest_per_night: 'per guest, per night',
    per_guest_per_stay:  'per guest, per stay',
    per_room_per_night:  'per room, per night',
    per_room_per_stay:   'per room, per stay',
    per_car_per_night:   'per car, per night',
};

function words(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const v = raw.trim().toLowerCase();
    // ETG says "unspecified" far more often than it says anything, and an
    // "unspecified" printed on the page is worse than a row that is not there.
    if (!v || v === 'unspecified' || v === 'unknown') return undefined;
    return ENUM_WORDS[v] ?? v.replace(/_/g, ' ');
}

interface Price { amount: number; currency: string; unit?: string }

/**
 * A price counts as stated only when a currency came with it.
 *
 * ETG writes `"0.00"` for two different facts: a cot that really is free
 * (`price: "0.00", currency: "EUR"`) and a charge the hotel never filled in
 * (`price: "0.00", currency: null`). Printing "Free" for the second would
 * disclose the opposite of the truth, so the currency is what decides — with
 * one, zero means free; without one, there is no price to show.
 */
function toPrice(item: Record<string, any>): Price | undefined {
    const currency = typeof item.currency === 'string' ? item.currency.trim() : '';
    if (!currency) return undefined;
    const amount = Number(item.price);
    if (!Number.isFinite(amount) || amount < 0) return undefined;
    const unit = typeof item.price_unit === 'string' && item.price_unit ? item.price_unit : undefined;
    return { amount, currency, ...(unit ? { unit } : {}) };
}

/** "IDR 400,000 per guest, per night". Whole amounts lose the decimals. */
function priceNote(p: Price): string {
    if (p.amount === 0) return 'Free';
    const n = Number.isInteger(p.amount)
        ? p.amount.toLocaleString('en-US')
        : p.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const unit = p.unit ? ` ${UNIT_WORDS[p.unit] ?? p.unit.replace(/_/g, ' ')}` : '';
    return `${p.currency} ${n}${unit}`;
}

function toInclusion(item: Record<string, any>): Inclusion {
    const inc = typeof item.inclusion === 'string' ? item.inclusion.toLowerCase() : '';
    if (inc === 'included')     return 'included';
    if (inc === 'not_included') return 'charged';

    // `deposit` and `children.extra_bed` state availability instead.
    const avail = [item.availability, item.extra_bed]
        .find(v => typeof v === 'string' && v.toLowerCase() !== 'unspecified');
    const a = typeof avail === 'string' ? avail.toLowerCase() : '';
    if (a === 'available')                            return 'available';
    if (a === 'not_available' || a === 'unavailable') return 'not_available';

    return 'unspecified';
}

/** "ages 0–17". A 0–0 range is ETG leaving the field blank, not a newborn. */
function ageRange(item: Record<string, any>): string | undefined {
    const from = Number(item.age_start);
    const to   = Number(item.age_end);
    if (!Number.isFinite(to) || to <= 0) return undefined;
    return `ages ${Number.isFinite(from) ? from : 0}–${to}`;
}

/**
 * The qualifier that tells one row of a group from the next. Each group
 * qualifies its rows with different keys, so this is a lookup rather than a
 * sweep over whatever the object happens to carry — an unrecognised key is
 * likelier to be noise than to be worth showing a guest.
 */
function toDetail(groupId: string, item: Record<string, any>): string | undefined {
    const parts: Array<string | undefined> = [];
    switch (groupId) {
        case 'pets':               parts.push(words(item.pets_type)); break;
        case 'parking':            parts.push(words(item.territory_type)); break;
        case 'meal':               parts.push(words(item.meal_type)); break;
        case 'children_meal':      parts.push(words(item.meal_type), ageRange(item)); break;
        case 'children':           parts.push(ageRange(item)); break;
        case 'shuttle':            parts.push(words(item.destination_type), words(item.shuttle_type)); break;
        case 'check_in_check_out': parts.push(words(item.check_in_check_out_type)); break;
        case 'internet':           parts.push(words(item.internet_type), words(item.work_area)); break;
        case 'deposit':            parts.push(words(item.deposit_type), words(item.payment_type)); break;
        case 'cot':
        case 'extra_bed': {
            const n = Number(item.amount);
            if (Number.isFinite(n) && n > 0) parts.push(`up to ${n}`);
            break;
        }
    }
    const detail = parts.filter(Boolean).join(', ');
    return detail || undefined;
}

/**
 * What the row says when no price came with it. A charge with no amount is
 * still worth disclosing — the guest needs to know to ask at the desk — but it
 * must not read as though the amount were zero.
 */
function inclusionNote(groupId: string, inclusion: Inclusion): string | undefined {
    if (groupId === 'children' && inclusion === 'available') return 'Extra bed available';
    switch (inclusion) {
        case 'included':      return 'Included in the rate';
        case 'charged':       return 'Not included in the rate';
        case 'available':     return 'Available';
        case 'not_available': return 'Not available';
        default:              return undefined;
    }
}

function toItem(groupId: string, spec: GroupSpec, raw: Record<string, any>): DetailItem | undefined {
    const detail = toDetail(groupId, raw);
    const price  = toPrice(raw);
    const note   = price ? priceNote(price) : inclusionNote(groupId, toInclusion(raw));

    // A row stating no price, no availability and no qualifier says nothing,
    // and a blank row reads as a missing one.
    if (!note && !detail) return undefined;

    return {
        label: detail ? `${spec.label} (${detail})` : spec.label,
        ...(spec.icon ? { icon: spec.icon } : {}),
        ...(note ? { note } : {}),
    };
}

/**
 * `no_show` and `visa` arrive as single objects rather than lists, and both are
 * `unspecified` on nearly every hotel, so each collapses to at most one row.
 */
function toSingletonItem(groupId: string, spec: GroupSpec, raw: Record<string, any>): DetailItem | undefined {
    if (groupId === 'visa') {
        const support = words(raw.visa_support);
        if (!support) return undefined;
        return { label: spec.label, note: support === 'available' ? 'Available' : 'Not available' };
    }

    // no_show: a deadline, not a fee. `time` is a clock time ("18:00") and
    // `day_period` says which day it falls on. It goes in the note rather than
    // the label so it is not mistaken for a charge.
    const time   = typeof raw.time === 'string' && raw.time.trim() ? raw.time.trim() : undefined;
    const period = words(raw.day_period);
    const note   = [time, period].filter(Boolean).join(' ');
    if (!note) return undefined;
    return { label: spec.label, note };
}

/**
 * Normalise one hotel's metapolicy. Returns `undefined` when the hotel stated
 * nothing at all, so a caller can leave the section off rather than draw an
 * empty heading.
 */
export function normalizeMetapolicy(struct: unknown, extraInfo?: string | null): Metapolicy | undefined {
    // The column is jsonb, but it has been written as a JSON *string* before
    // now — the same double-encoding `normalizeAmenityList` absorbs.
    let raw: any = struct;
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = null; }
    }

    const bySection = new Map<SectionId, DetailItem[]>();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [groupId, spec] of GROUPS) {
            const value = raw[groupId];
            if (!value || typeof value !== 'object') continue;

            const items = Array.isArray(value)
                ? value
                    .filter((it): it is Record<string, any> => !!it && typeof it === 'object')
                    .map(it => toItem(groupId, spec, it))
                    .filter((it): it is DetailItem => !!it)
                : [toSingletonItem(groupId, spec, value)].filter((it): it is DetailItem => !!it);

            if (!items.length) continue;
            const bucket = bySection.get(spec.section);
            if (bucket) bucket.push(...items);
            else bySection.set(spec.section, items);
        }
    }

    const sections: DetailSection[] = SECTIONS
        .filter(([id]) => bySection.has(id))
        .map(([id, title]) => ({ id, title, scope: 'property' as const, items: bySection.get(id)! }));

    const additionalInfo = typeof extraInfo === 'string' && extraInfo.trim() ? extraInfo.trim() : undefined;
    if (!sections.length && !additionalInfo) return undefined;
    return { sections, ...(additionalInfo ? { additionalInfo } : {}) };
}
