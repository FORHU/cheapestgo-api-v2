/**
 * prisma/seeds/seed-booking.ts
 *
 * Seeds a test booking_sessions row for local testing of
 * POST /api/internal/create-booking
 *
 * Usage:
 *   npx ts-node prisma/seeds/seed-booking.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── EDIT THESE VALUES before running ────────────────────────────────
const SEED = {
    provider: 'duffel',                    // 'duffel' | 'mystifly'
    duffelPreOrderId: 'ord_REPLACE_ME',    // real order id from Duffel test order
    duffelPreOrderPnr: 'REPLACE_ME',       // real booking_reference from Duffel
    chargedPrice: 250.00,
    currency: 'USD',
    status: 'payment_initiated',           // 'initiated' | 'payment_initiated'
};
// ─────────────────────────────────────────────────────────────────────

async function main() {
    const user = await prisma.users.findFirst();

    if (!user) {
        throw new Error('No users found in the database. Create a user first.');
    }

    const session = await prisma.booking_sessions.create({
        data: {
            user_id: user.id,
            provider: SEED.provider,
            flight: {},
            passengers: [],
            contact: {},
            status: SEED.status,
            expires_at: new Date(Date.now() + 60 * 60 * 1000),
            duffel_pre_order_id: SEED.duffelPreOrderId,
            duffel_pre_order_pnr: SEED.duffelPreOrderPnr,
            charged_price: SEED.chargedPrice,
            original_price: SEED.chargedPrice,
            currency: SEED.currency,
            payment_intent_id: 'pi_test_manual',
        },
    });

    console.log('✅ Seeded booking_sessions row:');
    console.log(JSON.stringify(session, null, 2));
    console.log('\nUse this sessionId in your /api/internal/create-booking test:');
    console.log(session.id);
}

main()
    .catch((err) => {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });