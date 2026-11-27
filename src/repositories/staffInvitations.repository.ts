import { prisma } from '@/lib/prisma';
import { normaliseEmail } from '@/repositories/auth.repository';
import type { Role } from '@/lib/auth/roles';

export class StaffInvitationsRepository {
    /** The one open invitation for an address, if any — email is not unique on this table. */
    findPendingByEmail(email: string) {
        return prisma.staff_invitations.findFirst({
            where: {
                email:       normaliseEmail(email),
                accepted_at: null,
                revoked_at:  null,
                expires_at:  { gt: new Date() },
            },
        });
    }

    findByTokenHash(tokenHash: string) {
        return prisma.staff_invitations.findUnique({ where: { token_hash: tokenHash } });
    }

    findById(id: string) {
        return prisma.staff_invitations.findUnique({ where: { id } });
    }

    create(data: { email: string; role: Role; tokenHash: string; invitedBy: string; expiresAt: Date }) {
        return prisma.staff_invitations.create({
            data: {
                email:      normaliseEmail(data.email),
                role:       data.role,
                token_hash: data.tokenHash,
                invited_by: data.invitedBy,
                expires_at: data.expiresAt,
            },
        });
    }

    /** Pending and already-settled invitations, newest first — the admin list is small enough to read in one page. */
    list() {
        return prisma.staff_invitations.findMany({
            orderBy: { created_at: 'desc' },
            take:    500,
        });
    }

    markAccepted(id: string) {
        return prisma.staff_invitations.update({
            where: { id },
            data:  { accepted_at: new Date() },
        });
    }

    markRevoked(id: string) {
        return prisma.staff_invitations.update({
            where: { id },
            data:  { revoked_at: new Date() },
        });
    }
}
