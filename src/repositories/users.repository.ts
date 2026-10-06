import { prisma } from '@/lib/prisma';

/**
 * The account rows: the user's own name, password and preferences.
 *
 * Reached only through UsersService. Nothing above this file writes to `users` or `profiles`
 * directly — the Layer Contract, and the reason the account rules can be read in one place.
 */
export class UsersRepository {
    async findPreferences(userId: string): Promise<unknown> {
        const profile = await prisma.profiles.findUnique({
            where:  { id: userId },
            select: { preferences: true },
        });
        return profile?.preferences ?? {};
    }

    /**
     * Preferences are replaced, not merged: the client sends the whole object it wants stored,
     * so a key it omits is a key it deleted. Upserted because a profile row may not exist yet
     * for an account that has never set one.
     */
    async savePreferences(userId: string, preferences: object): Promise<unknown> {
        const profile = await prisma.profiles.upsert({
            where:  { id: userId },
            update: { preferences },
            create: { id: userId, preferences },
            select: { preferences: true },
        });
        return profile.preferences ?? {};
    }

    async findPasswordHash(userId: string): Promise<string | null> {
        const user = await prisma.users.findUnique({
            where:  { id: userId },
            select: { password_hash: true },
        });
        return user?.password_hash ?? null;
    }

    async savePasswordHash(userId: string, passwordHash: string): Promise<void> {
        await prisma.users.update({
            where: { id: userId },
            data:  { password_hash: passwordHash, updated_at: new Date() },
        });
    }

    /** Either name, or both. An absent field is left as it was rather than blanked. */
    async saveName(userId: string, names: { firstName?: string; lastName?: string }) {
        return prisma.users.update({
            where: { id: userId },
            data: {
                ...(names.firstName !== undefined && { first_name: names.firstName }),
                ...(names.lastName  !== undefined && { last_name:  names.lastName  }),
                updated_at: new Date(),
            },
            select: { first_name: true, last_name: true },
        });
    }
}

export const usersRepository = new UsersRepository();
