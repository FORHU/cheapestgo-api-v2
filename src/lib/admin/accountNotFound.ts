import { Prisma } from '@prisma/client';
import { AppError } from '@/middleware/error.middleware';

/**
 * Run a write against one account, answering 404 when there is no such account.
 *
 * `prisma.users.update` and `.delete` throw P2025 when no row matches, and the error middleware
 * maps only `AppError`, so an admin action on an id that does not exist answered 500. Translated
 * here, at the admin routes that take an account id from the URL or body, rather than for every
 * P2025 in the API: elsewhere a missing row is usually our own bug, and a 404 would hide it.
 */
export async function orAccountNotFound<T>(write: Promise<T>): Promise<T> {
    try {
        return await write;
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
            throw new AppError(404, 'No such account', 'NOT_FOUND');
        }
        throw err;
    }
}
