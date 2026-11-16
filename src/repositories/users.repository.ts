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

    /**
     * The account holder's own details, across both rows that hold them.
     *
     * Birth date sits on `users` and phone and nationality on `profiles`, which is a split this
     * repository hides rather than inherits: nothing above it should have to know which table a
     * field of someone's profile happens to live in.
     */
    async findDetails(userId: string) {
        const [user, profile] = await Promise.all([
            prisma.users.findUnique({
                where:  { id: userId },
                select: { first_name: true, last_name: true, email: true, birth_date: true },
            }),
            prisma.profiles.findUnique({
                where:  { id: userId },
                select: { phone: true, nationality: true },
            }),
        ]);

        if (!user) return null;
        return {
            firstName:   user.first_name,
            lastName:    user.last_name,
            email:       user.email,
            // The column is a date, and a date is what the client asked for: sending the
            // midnight instant invites a timezone behind UTC to render the day before.
            birthDate:   user.birth_date ? user.birth_date.toISOString().slice(0, 10) : null,
            phone:       profile?.phone ?? null,
            nationality: profile?.nationality ?? null,
        };
    }

    /**
     * Save any of the traveller details. An absent field is left as it was rather than blanked.
     *
     * Both rows are written in one transaction because they are one thing to the person who
     * typed them: a traveller who filled in all three and saw it half-stored would have no way
     * of telling which half, and would be asked again for details already held.
     *
     * The profile row is upserted — an account that has never set a preference has no row yet —
     * while the user row is updated, since it cannot be missing for a caller holding a token.
     */
    async saveDetails(
        userId: string,
        details: { birthDate?: string; phone?: string; nationality?: string },
    ) {
        const profileFields = {
            ...(details.phone       !== undefined && { phone:       details.phone       }),
            ...(details.nationality !== undefined && { nationality: details.nationality }),
        };

        await prisma.$transaction(async tx => {
            if (details.birthDate !== undefined) {
                await tx.users.update({
                    where: { id: userId },
                    data:  { birth_date: new Date(`${details.birthDate}T00:00:00Z`), updated_at: new Date() },
                });
            }
            if (Object.keys(profileFields).length > 0) {
                await tx.profiles.upsert({
                    where:  { id: userId },
                    update: { ...profileFields, updated_at: new Date() },
                    create: { id: userId, ...profileFields },
                });
            }
        });

        return this.findDetails(userId);
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
