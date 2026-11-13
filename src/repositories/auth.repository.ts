import { prisma } from '@/lib/prisma';

/** An address as it is stored and compared: trimmed, lower case. Every door normalises with this. */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

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
    async findByEmail(email: string) {
        const wanted = normaliseEmail(email);
        const exact = await prisma.users.findUnique({ where: { email: wanted } });
        if (exact) return exact;
        return prisma.users.findFirst({
            where:   { email: { equals: wanted, mode: 'insensitive' } },
            orderBy: { created_at: 'asc' },
        });
    }

    findById(id: string) {
        return prisma.users.findUnique({ where: { id } });
    }

    create(data: {
        email: string;
        password_hash: string;
        first_name?: string;
        last_name?: string;
    }) {
        return prisma.users.create({ data: { ...data, email: normaliseEmail(data.email) } });
    }

    /**
     * The account behind a Google sign-in, created if this is the first time.
     *
     * Matched on email, which is the same key the browser callback upserts on, so the web
     * and the app reach one account rather than two. Names are only written on create: a
     * traveller who has since edited their profile should not have Google overwrite it on
     * every sign-in. The avatar is refreshed only when we hold none.
     */
    upsertFromGoogle(data: {
        email: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
    }) {
        return prisma.users.upsert({
            where: { email: data.email },
            create: {
                email: data.email,
                role: 'user',
                first_name: data.first_name,
                last_name: data.last_name,
                avatar_url: data.avatar_url,
            },
            update: {
                ...(data.avatar_url ? { avatar_url: data.avatar_url } : {}),
                updated_at: new Date(),
            },
        });
    }
}
