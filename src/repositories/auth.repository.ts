import { prisma } from '@/lib/prisma';

export class AuthRepository {
    findByEmail(email: string) {
        return prisma.users.findUnique({ where: { email } });
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
        return prisma.users.create({ data });
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
