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
}
