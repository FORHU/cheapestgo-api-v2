import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `runSupplierHealthCheck` flipping `stays_maintenance` is a supplier config change (#118) —
 * it decides whether the site sells hotels at all, and nothing logged it before this. It runs
 * from both a scheduled job (no actor) and an admin's "Check now" (a session that today's
 * route still discards) — logged the same either way, since the event is what matters.
 */

const settingsStore = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/lib/prisma', () => ({
    prisma: {
        admin_settings: {
            findMany: vi.fn(async () => [...settingsStore.entries()].map(([key, value]) => ({ key, value }))),
            upsert:   vi.fn(async ({ where, update, create }: any) => {
                settingsStore.set(where.key, update?.value ?? create?.value);
            }),
        },
    },
}));

const tgx = vi.hoisted(() => ({ merchantOptions: 0, throws: false }));
vi.mock('@/lib/hotels/travelgatex', () => ({
    resolveTgxDestinationCode: vi.fn(async () => 'LON'),
    getTgxConfig:   vi.fn(() => ({})),
    getTgxSettings: vi.fn(() => ({})),
    tgxGraphQL: vi.fn(async () => {
        if (tgx.throws) throw new Error('supplier unreachable');
        return { data: { hotelX: { search: {
            options: Array.from({ length: tgx.merchantOptions }, () => ({ paymentType: 'MERCHANT' })),
        } } } };
    }),
}));

vi.mock('@/lib/admin/notify', () => ({ createNotification: vi.fn() }));

const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: audit }));

import { adminSettingsService } from '@/services/adminSettings.service';

beforeEach(() => {
    settingsStore.clear();
    tgx.merchantOptions = 0;
    tgx.throws = false;
    audit.mockClear();
});

describe('runSupplierHealthCheck (#118)', () => {
    it('logs nothing below the streak threshold, maintenance unchanged', async () => {
        const result = await adminSettingsService.runSupplierHealthCheck();
        expect(result.switched).toBeNull();
        expect(audit).not.toHaveBeenCalled();
    });

    it('logs the config change once three consecutive failures switch maintenance on', async () => {
        await adminSettingsService.runSupplierHealthCheck();
        await adminSettingsService.runSupplierHealthCheck();
        expect(audit).not.toHaveBeenCalled(); // not yet — streak is 2

        const third = await adminSettingsService.runSupplierHealthCheck();
        expect(third.switched).toBe('on');
        expect(audit).toHaveBeenCalledTimes(1);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'stays_maintenance_toggled',
            previousValue: { maintenance: false },
            newValue:      { maintenance: true },
        }));
    });

    it('logs again when recovery switches maintenance back off', async () => {
        for (let i = 0; i < 3; i++) await adminSettingsService.runSupplierHealthCheck(); // on
        audit.mockClear();

        tgx.merchantOptions = 5; // healthy from here
        await adminSettingsService.runSupplierHealthCheck();
        expect(audit).not.toHaveBeenCalled(); // streak 1 of 2

        const second = await adminSettingsService.runSupplierHealthCheck();
        expect(second.switched).toBe('off');
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'stays_maintenance_toggled',
            previousValue: { maintenance: true },
            newValue:      { maintenance: false },
        }));
    });

    it('does not log when the probe itself fails — that is not a config change', async () => {
        tgx.throws = true;
        const result = await adminSettingsService.runSupplierHealthCheck();
        expect(result.status).toBe('unknown');
        expect(audit).not.toHaveBeenCalled();
    });
});
