import crypto from 'crypto';

/**
 * The token a staff invitation lives or dies by.
 *
 * The raw token goes out in one email and nowhere else; `token_hash` is what the database
 * holds, the same split `password_reset_tokens` would use if it needed to survive a leaked
 * row — an invitation grants a staff role, which is worth the extra step a password reset
 * token (1 hour, one account) is not.
 */
export function generateInvitationToken(): string {
    return crypto.randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type InvitationProblem = 'not_found' | 'expired' | 'used' | 'revoked';

export interface InvitationRecord {
    expires_at:  Date;
    accepted_at: Date | null;
    revoked_at:  Date | null;
}

/**
 * Why a token may not be exchanged, distinguishably — issue #105 asks for expired, used and
 * revoked to read as different outcomes, not one generic "invalid or expired".
 *
 * Checked in this order on purpose: a revoked invitation is refused as revoked even if it has
 * since also expired, and a used one is refused as used even if revoked after the fact —
 * acceptance is the one irreversible step, so once it has happened that is the whole answer.
 */
export function classifyInvitation(invitation: InvitationRecord | null, now = new Date()): InvitationProblem | null {
    if (!invitation) return 'not_found';
    if (invitation.accepted_at) return 'used';
    if (invitation.revoked_at) return 'revoked';
    if (invitation.expires_at.getTime() <= now.getTime()) return 'expired';
    return null;
}
