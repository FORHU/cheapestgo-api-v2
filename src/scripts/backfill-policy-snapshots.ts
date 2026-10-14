// Give every hotel booking taken before policy snapshots existed the terms it was sold on.
//
// Why it matters: a cancellation refunds what the recorded terms allow (ADR-0023), and a
// booking with no snapshot has no recorded terms — so `cancelBooking` refunds nothing, even on
// a rate that was free to cancel. That is the safe direction for a booking nobody can read, and
// the wrong one for a guest who was promised a refund. The terms are not lost: they were stored
// in `bookings.cancellation_policy` at booking time. This turns them into the snapshot.
//
// Derived with `snapshotFromPolicy`, the same function confirm uses, so a backfilled booking is
// held to exactly the rule a booking confirmed today would be.
//
// Safe by default:
//   - **Dry run unless `--apply`.** It says what it would write and writes nothing.
//   - **Idempotent.** A booking that already has a snapshot is never touched, so it can be run
//     again after a partial run without rewriting anything that exists.
//   - **Skips what it cannot read.** A booking with no stored policy is listed, not guessed at —
//     inventing terms would be worse than having none.
//   - **Says which database it is pointed at before doing anything.**
//
//   npm run backfill-policy-snapshots             # dry run
//   npm run backfill-policy-snapshots -- --apply  # write
import { prisma } from '@/lib/prisma';
import { HotelsRepository } from '@/repositories/hotels.repository';
import { snapshotFromPolicy, type StoredCancelPolicy } from '@/lib/policies/snapshotFromPolicy';

async function main() {
    const apply = process.argv.includes('--apply');

    const target = (() => {
        try {
            const url = new URL(process.env.DATABASE_URL ?? '');
            return `${url.hostname}:${url.port || 5432}${url.pathname}`;
        } catch {
            return '(unparseable DATABASE_URL)';
        }
    })();
    console.log(`[backfill] database: ${target}`);
    console.log(`[backfill] mode:     ${apply ? 'APPLY — snapshots will be written' : 'dry run — nothing will be written'}`);

    const bookings = await prisma.$queryRaw<{
        booking_id: string;
        status: string | null;
        currency: string | null;
        cancellation_policy: unknown;
    }[]>`
        SELECT b.booking_id, b.status, b.currency, b.cancellation_policy
        FROM bookings b
        WHERE NOT EXISTS (SELECT 1 FROM booking_policy_snapshots s WHERE s.booking_id = b.booking_id)
        ORDER BY b.created_at
    `;

    console.log(`[backfill] bookings without a snapshot: ${bookings.length}`);

    const repo = new HotelsRepository();
    const counts = { written: 0, wouldWrite: 0, unreadable: 0, failed: 0 };
    const byType: Record<string, number> = {};

    for (const b of bookings) {
        const policy = readPolicy(b.cancellation_policy);
        if (!policy) {
            counts.unreadable++;
            console.log(`  skip  ${b.booking_id} (${b.status ?? '?'}) — no stored policy to derive terms from`);
            continue;
        }

        const terms = snapshotFromPolicy(policy, (b.currency ?? 'PHP').toUpperCase());
        byType[terms.policyType] = (byType[terms.policyType] ?? 0) + 1;

        const line = `${b.booking_id} (${b.status ?? '?'}) → ${terms.policyType}, ${terms.tiers.length} tier(s)`
            + (terms.freeCancelDeadline ? `, free until ${terms.freeCancelDeadline.toISOString()}` : '');

        if (!apply) {
            counts.wouldWrite++;
            console.log(`  would ${line}`);
            continue;
        }

        try {
            await repo.savePolicySnapshot({ bookingId: b.booking_id, ...terms, rawResponse: policy });
            counts.written++;
            console.log(`  wrote ${line}`);
        } catch (err: any) {
            counts.failed++;
            console.error(`  FAIL  ${b.booking_id}: ${err?.message?.slice(0, 160)}`);
        }
    }

    console.log('[backfill] by policy type:', byType);
    console.log('[backfill] done:', counts);
    if (counts.failed) process.exitCode = 1;
}

/** `cancellation_policy` is jsonb, and some rows hold it double-encoded as a JSON string. */
function readPolicy(raw: unknown): StoredCancelPolicy | null {
    let value = raw;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return null; }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const policy = value as StoredCancelPolicy;
    // Nothing to derive terms from: neither a refundability flag nor any penalty step.
    if (!policy.refundableTag && !(policy.cancelPolicyInfos?.length)) return null;
    return policy;
}

main()
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
