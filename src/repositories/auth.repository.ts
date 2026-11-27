import { prisma } from '@/lib/prisma';
import { initialPreferences } from '@/lib/users/onboarding';

/** An address as it is stored and compared: trimmed, lower case. Every door normalises with this. */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

type UsersClient = Pick<typeof prisma, 'users'>;

/** `findByEmail`'s lookup, usable inside a transaction. */
async function findAccount(client: UsersClient, email: string) {
    const wanted = normaliseEmail(email);
    const exact = await client.users.findUnique({ where: { email: wanted } });
    if (exact) return exact;
    return client.users.findFirst({
        where:   { email: { equals: wanted, mode: 'insensitive' } },
        orderBy: { created_at: 'asc' },
    });
}

export class AuthRepository {
    /**
     * The account for an address, whatever case it was typed in.
     *
     * New accounts are stored lower case, so the indexed exact match answers nearly every call.
     * The case-insensitive second look is for accounts made before that — `Ana@Example.com` as
     * typed at sign-up — which a lower-cased lookup alone would stop finding the moment the
     * door began normalising, locking those customers out until a migration lowercased them.
     * The oldest wins if there are case-variant duplicates, as it is the one that has history.
     */
    findByEmail(email: string) {
        return findAccount(prisma, email);
    }

    findById(id: string) {
        return prisma.users.findUnique({ where: { id } });
    }

    /**
     * A new account, with its onboarding start marker written alongside it. See mobile #62.
     *
     * In a transaction rather than two calls, because an account that exists without the marker
     * reads as one made before onboarding existed: a failure between the two writes would
     * quietly excuse a brand-new traveller from a flow they are supposed to complete.
     *
     * The profile row is **updated**, not created. A database trigger — `on_user_created`,
     * calling `handle_new_user` — already inserts `profiles (id, email)` as the user row lands,
     * so creating it here collides with that insert and fails the primary key. The trigger is
     * not in this repository and not in any migration that runs, which is the only reason it is
     * worth a comment: nothing in the code says it exists. `upsert` rather than `update` so
     * this keeps working if the trigger is ever dropped.
     */
    create(data: {
        email: string;
        password_hash: string;
        first_name?: string;
        last_name?: string;
        /** Defaults to the column's own default, `'user'` — a staff invitation is the one caller that passes this. */
        role?: string;
    }) {
        return prisma.$transaction(async tx => {
            const user = await tx.users.create({ data: { ...data, email: normaliseEmail(data.email) } });
            await tx.profiles.upsert({
                where:  { id: user.id },
                update: { preferences: initialPreferences() },
                create: { id: user.id, email: user.email, preferences: initialPreferences() },
            });
            return user;
        });
    }

    /**
     * The account behind a Google sign-in, created if this is the first time.
     *
     * Matched on email, which is the same key the browser callback upserts on, so the web
     * and the app reach one account rather than two. Names are only written on create: a
     * traveller who has since edited their profile should not have Google overwrite it on
     * every sign-in. The avatar is refreshed only when we hold none.
     *
     * The onboarding start marker is written only when this call is the one that creates the
     * account. Looking first is what makes that knowable: a Google sign-in cannot otherwise
     * tell a first time from a returning one, and marking a returning traveller would send
     * somebody who finished onboarding months ago back through it. See mobile #62.
     *
     * Preferences are left untouched on the returning path, so the currency and language set
     * in the browser survive every sign-in from the phone.
     */
    upsertFromGoogle(data: {
        email: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
    }) {
        return prisma.$transaction(async tx => {
            // Found the way password sign-in finds it, so an account stored as `Ana@Example.com`
            // before addresses were normalised is the one Google signs into — not a second,
            // lower-case account beside it. Updated by id for the same reason.
            const existing = await findAccount(tx, data.email);
            if (existing) {
                return tx.users.update({
                    where: { id: existing.id },
                    data: {
                        ...(data.avatar_url ? { avatar_url: data.avatar_url } : {}),
                        updated_at: new Date(),
                    },
                });
            }

            const user = await tx.users.create({
                data: {
                    email: normaliseEmail(data.email),
                    role: 'user',
                    first_name: data.first_name,
                    last_name: data.last_name,
                    avatar_url: data.avatar_url,
                },
            });
            await tx.profiles.upsert({
                where:  { id: user.id },
                update: { preferences: initialPreferences() },
                create: { id: user.id, email: user.email, preferences: initialPreferences() },
            });
            return user;
        });
    }
}
