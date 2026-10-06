import bcrypt from 'bcryptjs';
import { AppError } from '@/middleware/error.middleware';
import { usersRepository, UsersRepository } from '@/repositories/users.repository';
import { checkName } from '@/lib/users/names';

/**
 * What an account holder may change about their own account: their name, their password, their
 * preferences.
 *
 * The rules live here rather than in the route because the same ones are enforced from more than
 * one entry point, and because a rule in a route file is a rule nobody finds twice.
 */
export class UsersService {
    constructor(private readonly repo: UsersRepository = usersRepository) {}

    async getPreferences(userId: string): Promise<unknown> {
        return this.repo.findPreferences(userId);
    }

    async savePreferences(userId: string, body: unknown): Promise<unknown> {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new AppError(400, 'Request body must be a JSON object', 'VALIDATION_ERROR');
        }
        return this.repo.savePreferences(userId, body as object);
    }

    /**
     * A password change proves the current one first.
     *
     * An account with no password — created through Google — cannot change one here; it has
     * nothing to verify against, and accepting the request would let a stolen session set a
     * password and take the account over.
     */
    async changePassword(userId: string, currentPassword?: string, newPassword?: string): Promise<void> {
        if (!currentPassword || !newPassword) {
            throw new AppError(400, 'currentPassword and newPassword are required', 'VALIDATION_ERROR');
        }
        if (newPassword.length < 8) {
            throw new AppError(400, 'New password must be at least 8 characters', 'VALIDATION_ERROR');
        }

        const hash = await this.repo.findPasswordHash(userId);
        if (!hash) throw new AppError(400, 'No password set on this account', 'VALIDATION_ERROR');

        const valid = await bcrypt.compare(currentPassword, hash);
        if (!valid) throw new AppError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');

        await this.repo.savePasswordHash(userId, await bcrypt.hash(newPassword, 10));
    }

    /**
     * Rename the account holder.
     *
     * Each field is checked on its own, because a partial update may carry either. The length
     * cap is enforced here and not only in the form: this endpoint is the authority, and in v1 a
     * 13,708-character name reached the database through exactly this path (QA BG-9).
     */
    async updateProfile(userId: string, firstName?: string, lastName?: string) {
        if (firstName === undefined && lastName === undefined) {
            throw new AppError(400, 'Nothing to update', 'VALIDATION_ERROR');
        }

        const checked: { firstName?: string; lastName?: string } = {};
        for (const [key, label, value] of [
            ['firstName', 'First name', firstName],
            ['lastName',  'Last name',  lastName],
        ] as const) {
            if (value === undefined) continue;
            const result = checkName(value, label);
            if (!result.ok) throw new AppError(400, result.error!, 'VALIDATION_ERROR');
            checked[key] = result.value;
        }

        const updated = await this.repo.saveName(userId, checked);
        return { firstName: updated.first_name, lastName: updated.last_name };
    }
}

export const usersService = new UsersService();
