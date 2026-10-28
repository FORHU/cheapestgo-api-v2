import { assertTransition, type HotelBookingStatus } from '@/lib/hotels/lifecycle/stateMachine';
import type {
    HotelBookingLifecycleRepository,
    LifecycleGuest,
    LifecycleRecord,
    TransitionOptions,
    TransitionResult,
    BeginInput,
} from '@/repositories/hotelBookingLifecycle.repository';

/**
 * A lifecycle repository that lives in memory and keeps the one promise the real one makes:
 * a transition is applied only if the booking is still in one of the states it names, so of any
 * number of callers racing for a claim exactly one wins.
 */
export class InMemoryLifecycleRepo {
    readonly records = new Map<string, LifecycleRecord>();
    readonly guests  = new Map<string, LifecycleGuest[]>();
    readonly log: Array<{ reference: string; from: HotelBookingStatus | null; to: HotelBookingStatus; actor: string; reason?: string }> = [];
    readonly payments = new Map<string, string>();
    /** Flip to simulate the lifecycle tables being unreachable. */
    unavailable = false;

    seed(over: Partial<LifecycleRecord> & { reference: string }): LifecycleRecord {
        const rec: LifecycleRecord = {
            id: `id-${this.records.size + 1}`, userId: 'user-1', status: 'PAYMENT_PENDING', provider: 'mock',
            prebookRef: 'MOCK:x', paymentIntentId: 'pi_mock_1', hotelCode: null, propertyName: null, roomName: null,
            checkIn: null, checkOut: null, currency: 'USD', amountMinor: 26400, draft: {},
            supplierReference: null, failureCode: null, failureMessage: null,
            createdAt: new Date('2026-10-15T00:00:00Z'), updatedAt: new Date('2026-10-15T00:00:00Z'),
            ...over,
        };
        this.records.set(rec.reference, rec);
        return rec;
    }

    status(reference: string): HotelBookingStatus | undefined { return this.records.get(reference)?.status; }
    path(reference: string): string[] { return this.log.filter((e) => e.reference === reference).map((e) => e.to); }

    async begin(input: BeginInput) {
        if (this.unavailable) return null;
        return this.records.get(input.reference)
            ?? this.seed({ reference: input.reference, userId: input.userId, paymentIntentId: input.paymentIntentId, prebookRef: input.prebookRef });
    }

    async transition(
        reference: string, from: HotelBookingStatus | HotelBookingStatus[], to: HotelBookingStatus, options: TransitionOptions,
    ): Promise<TransitionResult> {
        const froms = Array.isArray(from) ? from : [from];
        for (const f of froms) assertTransition(f, to);
        if (this.unavailable) return 'unavailable';

        // Yield, so concurrent callers genuinely interleave.
        await Promise.resolve();
        const rec = this.records.get(reference);
        if (!rec || !froms.includes(rec.status)) return 'lost';

        this.log.push({ reference, from: rec.status, to, actor: options.actor, reason: options.reason });
        rec.status = to;
        rec.updatedAt = new Date();
        if (options.patch?.supplierReference) rec.supplierReference = options.patch.supplierReference;
        if (options.patch?.failureCode) rec.failureCode = options.patch.failureCode;
        if (options.patch?.failureMessage) rec.failureMessage = options.patch.failureMessage;
        return 'applied';
    }

    async note() { /* not asserted on */ }

    async findByReference(reference: string) {
        if (this.unavailable) return null;
        const r = this.records.get(reference);
        return r ? { ...r } : null;
    }

    async findByPaymentIntent(pi: string) {
        if (this.unavailable) return null;
        const r = [...this.records.values()].find((x) => x.paymentIntentId === pi);
        return r ? { ...r } : null;
    }

    async saveConfirmInputs(reference: string, input: { draft: Record<string, unknown>; guests: LifecycleGuest[] }) {
        if (this.unavailable) return false;
        const rec = this.records.get(reference);
        if (!rec) return false;
        rec.draft = { ...rec.draft, ...input.draft };
        this.guests.set(reference, input.guests);
        return true;
    }

    async loadGuests(reference: string) { return this.guests.get(reference) ?? []; }

    async markPayment(pi: string, status: string) { this.payments.set(pi, status); }

    async findAbandoned() { return []; }
    async findNeedingAttention() { return []; }
    async events() { return []; }

    asRepository(): HotelBookingLifecycleRepository {
        return this as unknown as HotelBookingLifecycleRepository;
    }
}
