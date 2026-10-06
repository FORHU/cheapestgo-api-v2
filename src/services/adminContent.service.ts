import { AppError } from '@/middleware/error.middleware';
import { adminContentRepository, AdminContentRepository } from '@/repositories/adminContent.repository';

/**
 * The back office's list-and-edit screens (C5, ported from v1's /api/admin/*).
 *
 * Every screen here takes the same three things — a page, an optional search, an optional
 * filter — and the same small vocabulary of actions. The rules that matter are about refusing
 * nonsense before it reaches the database: a page number below one, a page size someone typed
 * into the URL, an action with nothing to act on.
 */

/** A screenful. Large enough to be worth a request, small enough to render. */
const DEFAULT_PAGE_SIZE = 20;

/** Nobody needs a thousand rows in one response, whatever the query string says. */
const MAX_PAGE_SIZE = 100;

export interface AdminListQuery {
    page?:     unknown;
    pageSize?: unknown;
    q?:        unknown;
}

export function readPage(query: AdminListQuery) {
    const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
    const requested = Number.parseInt(String(query.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(Math.max(1, requested), MAX_PAGE_SIZE);
    const raw = typeof query.q === 'string' ? query.q.trim() : '';
    return { page, pageSize, query: raw || undefined };
}

/**
 * The ids an action applies to, from either `id` or `ids`.
 *
 * Both spellings exist because the screens send one when a row is acted on and many when a
 * selection is. An action with neither is a mistake worth refusing: the alternative, a
 * `deleteMany` with an empty filter, deletes the table.
 */
export function readTargets(body: { id?: unknown; ids?: unknown }): string[] {
    const many = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : [];
    if (many.length) return many;
    if (typeof body.id === 'string' && body.id) return [body.id];
    throw new AppError(400, 'id or ids required', 'VALIDATION_ERROR');
}

export class AdminContentService {
    constructor(private readonly repo: AdminContentRepository = adminContentRepository) {}

    // ─── Destinations ─────────────────────────────────────────────────────────

    async listDestinations(query: AdminListQuery) {
        return this.repo.listDestinations(readPage(query));
    }

    async createDestination(body: { city?: unknown; country?: unknown; image_url?: unknown; average_price?: unknown }) {
        const city = typeof body.city === 'string' ? body.city.trim() : '';
        const country = typeof body.country === 'string' ? body.country.trim() : '';
        if (!city || !country) throw new AppError(400, 'city and country are required', 'VALIDATION_ERROR');

        return this.repo.createDestination({
            city,
            country,
            imageUrl:     typeof body.image_url === 'string' ? body.image_url : null,
            averagePrice: typeof body.average_price === 'number' ? body.average_price : null,
        });
    }

    async updateDestination(body: { id?: unknown; city?: unknown; country?: unknown; image_url?: unknown; average_price?: unknown }) {
        if (typeof body.id !== 'string' || !body.id) throw new AppError(400, 'id is required', 'VALIDATION_ERROR');
        return this.repo.updateDestination(body.id, {
            ...(typeof body.city === 'string' ? { city: body.city.trim() } : {}),
            ...(typeof body.country === 'string' ? { country: body.country.trim() } : {}),
            ...(body.image_url !== undefined ? { imageUrl: typeof body.image_url === 'string' ? body.image_url : null } : {}),
            ...(body.average_price !== undefined ? { averagePrice: typeof body.average_price === 'number' ? body.average_price : null } : {}),
        });
    }

    async deleteDestinations(body: { id?: unknown; ids?: unknown }) {
        const { count } = await this.repo.deleteDestinations(readTargets(body));
        return { deleted: count };
    }

    // ─── Saved trips ──────────────────────────────────────────────────────────

    async listSavedTrips(query: AdminListQuery & { type?: unknown }) {
        const type = query.type === 'flight' || query.type === 'hotel' ? query.type : undefined;
        return this.repo.listSavedTrips({ ...readPage(query), type });
    }

    async deleteSavedTrips(body: { id?: unknown; ids?: unknown }) {
        const { count } = await this.repo.deleteSavedTrips(readTargets(body));
        return { deleted: count };
    }

    // ─── Price alerts ─────────────────────────────────────────────────────────

    async listPriceAlerts(query: AdminListQuery & { status?: unknown }) {
        const status = query.status === 'active' || query.status === 'inactive' ? query.status : undefined;
        return this.repo.listPriceAlerts({ ...readPage(query), status });
    }

    /**
     * Deactivating is the kind thing to reach for first: a customer's alert that stops emailing
     * can be turned back on, and a deleted one cannot be explained to them.
     */
    async actOnPriceAlerts(body: { action?: unknown; id?: unknown; ids?: unknown }) {
        const targets = readTargets(body);
        switch (body.action) {
            case 'activate':   await this.repo.setPriceAlertsActive(targets, true);  return { updated: targets.length };
            case 'deactivate': await this.repo.setPriceAlertsActive(targets, false); return { updated: targets.length };
            case 'delete': {
                const { count } = await this.repo.deletePriceAlerts(targets);
                return { deleted: count };
            }
            default:
                throw new AppError(400, `Unknown action: ${String(body.action)}`, 'VALIDATION_ERROR');
        }
    }

    // ─── Notifications ────────────────────────────────────────────────────────

    async listNotifications() {
        return this.repo.listNotifications();
    }

    async actOnNotifications(body: { action?: unknown; id?: unknown }) {
        if (body.action === 'markAllRead') {
            await this.repo.markAllNotificationsRead();
            return { success: true };
        }
        if (body.action === 'markRead') {
            if (typeof body.id !== 'string' || !body.id) throw new AppError(400, 'id is required', 'VALIDATION_ERROR');
            await this.repo.markNotificationRead(body.id);
            return { success: true };
        }
        throw new AppError(400, `Unknown action: ${String(body.action)}`, 'VALIDATION_ERROR');
    }
}

export const adminContentService = new AdminContentService();
