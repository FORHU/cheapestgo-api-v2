import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';
import { StaffInvitationsRepository } from '@/repositories/staffInvitations.repository';
import { AuthRepository } from '@/repositories/auth.repository';
import { logAdminAction } from '@/lib/admin/audit';
import { mailConfigured, sendMail } from '@/lib/email/mailer';
import { isRole, roleLabel, type Role } from '@/lib/auth/roles';
import { checkName } from '@/lib/users/names';
import { assertPasswordAcceptable } from '@/lib/auth/password';
import {
    generateInvitationToken, hashInvitationToken, classifyInvitation, INVITATION_TTL_MS,
    type InvitationProblem,
} from '@/lib/auth/staffInvitationToken';
import type { JwtPayload } from '@/types';

/**
 * Staff invitation, acceptance, listing and revocation. See issue #105.
 *
 * `staff.invite` does not exist as a checked permission yet — #106 builds the general
 * authorisation middleware this is meant to sit behind, and #107 is what would let
 * `/auth/me` tell a console which buttons to draw. Until then the route this service sits
 * behind gates on `requireRole('admin')`, which is the only role today that can administer
 * anything (`canAdminister`), so it is the correct door for now rather than a shortcut around
 * the real one.
 */

const MESSAGE_FOR: Record<InvitationProblem, string> = {
    not_found: 'This invitation link is not valid.',
    expired:   'This invitation has expired. Ask whoever invited you to send a new one.',
    used:      'This invitation has already been used.',
    revoked:   'This invitation has been revoked.',
};

export class StaffInvitationsService {
    private repo = new StaffInvitationsRepository();
    private authRepo = new AuthRepository();

    async invite(input: {
        actorId: string;
        actorEmail?: string;
        email: string;
        role: unknown;
        /** Origin the accept link is built against — the console that asked for the invite. */
        acceptUrlBase: string;
    }) {
        // Not `canAdminister` / 'admin' alone: that would make it impossible to ever invite
        // the first support agent. Any staff role is a valid grant; only 'user' is refused,
        // because inviting someone to be a customer is not what this endpoint is for.
        if (!isRole(input.role) || input.role === 'user') {
            throw new AppError(400, 'Role must be "admin" or "support_agent".', 'VALIDATION_ERROR');
        }
        const role = input.role as Role;

        const existingAccount = await this.authRepo.findByEmail(input.email);
        if (existingAccount) {
            // Promoting an existing account is `/admin/users/:id/promote`'s job, not this
            // one's — this endpoint exists to create accounts that do not exist yet.
            throw new AppError(409, 'An account with this email already exists.', 'EMAIL_TAKEN');
        }

        const pending = await this.repo.findPendingByEmail(input.email);
        if (pending) {
            throw new AppError(409, 'An invitation to this address is already pending.', 'INVITATION_PENDING');
        }

        const token = generateInvitationToken();
        const invitation = await this.repo.create({
            email:     input.email,
            role,
            tokenHash: hashInvitationToken(token),
            invitedBy: input.actorId,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        });

        const acceptUrl = `${input.acceptUrlBase}/accept-invitation?token=${token}`;
        if (mailConfigured()) {
            const sent = await sendMail({
                to:      invitation.email,
                subject: `You're invited to the CheapestGo staff console as ${roleLabel(role)}`,
                html: `<p>You have been invited to join the CheapestGo staff console as <b>${roleLabel(role)}</b>.</p>
<p><a href="${acceptUrl}">Accept the invitation</a> to set your password and sign in. This link expires in 7 days.</p>
<p>If you were not expecting this, you can ignore this email.</p>`,
            });
            if (!sent.ok) console.error('[staffInvitations] invite email send failed:', sent.error);
        }

        void logAdminAction({
            action:     'staff_invitation_sent',
            adminId:    input.actorId,
            adminEmail: input.actorEmail,
            targetId:   invitation.id,
            details:    { email: invitation.email, role },
        });

        return this.sanitize(invitation);
    }

    async list() {
        const invitations = await this.repo.list();
        return invitations.map(i => this.sanitize(i));
    }

    async revoke(input: { actorId: string; actorEmail?: string; id: string }) {
        const invitation = await this.repo.findById(input.id);
        if (!invitation) throw new AppError(404, 'Invitation not found.', 'NOT_FOUND');
        if (invitation.accepted_at) {
            throw new AppError(409, 'This invitation has already been accepted.', 'ALREADY_ACCEPTED');
        }

        if (!invitation.revoked_at) {
            await this.repo.markRevoked(input.id);
            void logAdminAction({
                action:     'staff_invitation_revoked',
                adminId:    input.actorId,
                adminEmail: input.actorEmail,
                targetId:   invitation.id,
                details:    { email: invitation.email },
            });
        }

        return this.sanitize({ ...invitation, revoked_at: invitation.revoked_at ?? new Date() });
    }

    async accept(input: { token: string; password: string; firstName?: string; lastName?: string }) {
        const invitation = await this.repo.findByTokenHash(hashInvitationToken(input.token));
        const problem = classifyInvitation(invitation);
        if (problem) {
            throw new AppError(400, MESSAGE_FOR[problem], `INVITATION_${problem.toUpperCase()}`);
        }
        // `classifyInvitation` returning null means `invitation` is not null.
        const found = invitation!;

        assertPasswordAcceptable(input.password);

        const names: { first_name?: string; last_name?: string } = {};
        for (const [key, label, value] of [
            ['first_name', 'First name', input.firstName],
            ['last_name',  'Last name',  input.lastName],
        ] as const) {
            if (value === undefined) continue;
            const checked = checkName(value, label);
            if (!checked.ok) throw new AppError(400, checked.error!, 'VALIDATION_ERROR');
            names[key] = checked.value;
        }

        // Defensive: nothing should be able to reach here for an address that was given an
        // account between the invite and this accept, but refusing is the safe answer if it
        // ever does, rather than silently turning one invitation into two staff accounts.
        const existingAccount = await this.authRepo.findByEmail(found.email);
        if (existingAccount) throw new AppError(409, 'An account with this email already exists.', 'EMAIL_TAKEN');

        const password_hash = await bcrypt.hash(input.password, 12);
        const user = await this.authRepo.create({
            email: found.email,
            password_hash,
            role:  found.role,
            ...names,
        });

        await this.repo.markAccepted(found.id);

        void logAdminAction({
            action:     'staff_invitation_accepted',
            adminId:    user.id,
            adminEmail: user.email,
            targetId:   found.id,
            details:    { role: found.role, invitedBy: found.invited_by },
        });

        const { password_hash: _hash, ...safeUser } = user;
        return { user: safeUser, ...this.generateTokens(user) };
    }

    private generateTokens(user: { id: string; email: string; role: string }) {
        const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
            sub:   user.id,
            email: user.email,
            role:  user.role as Role,
        };
        return {
            accessToken:  jwt.sign(payload, config.JWT_SECRET,        { expiresIn: config.JWT_EXPIRES_IN as any }),
            refreshToken: jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: config.JWT_REFRESH_EXPIRES_IN as any }),
        };
    }

    /** Never the hash, never the raw token — only what a console needs to list and manage invitations. */
    private sanitize(invitation: {
        id: string; email: string; role: string;
        invited_by: string; expires_at: Date; accepted_at: Date | null; revoked_at: Date | null; created_at: Date;
    }) {
        const { id, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at } = invitation;
        return { id, email, role, invitedBy: invited_by, expiresAt: expires_at, acceptedAt: accepted_at, revokedAt: revoked_at, createdAt: created_at };
    }
}
