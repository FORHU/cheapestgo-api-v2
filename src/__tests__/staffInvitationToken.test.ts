import { describe, it, expect } from 'vitest';
import {
    generateInvitationToken, hashInvitationToken, classifyInvitation,
} from '@/lib/auth/staffInvitationToken';

describe('generateInvitationToken / hashInvitationToken', () => {
    it('generates a token that is not the string stored for comparison', () => {
        const token = generateInvitationToken();
        expect(hashInvitationToken(token)).not.toBe(token);
    });

    it('hashes the same token to the same value, so a lookup by hash works', () => {
        const token = generateInvitationToken();
        expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    });

    it('never generates the same token twice in practice', () => {
        const tokens = new Set(Array.from({ length: 50 }, generateInvitationToken));
        expect(tokens.size).toBe(50);
    });
});

describe('classifyInvitation', () => {
    const base = () => ({ expires_at: new Date(Date.now() + 60_000), accepted_at: null, revoked_at: null });

    it('is fine for one that is open and not yet expired', () => {
        expect(classifyInvitation(base())).toBeNull();
    });

    it('reads a missing row as not_found', () => {
        expect(classifyInvitation(null)).toBe('not_found');
    });

    it('reads a past expiry as expired', () => {
        expect(classifyInvitation({ ...base(), expires_at: new Date(Date.now() - 1000) })).toBe('expired');
    });

    it('reads a revoked one as revoked, even past its expiry', () => {
        expect(classifyInvitation({
            ...base(), expires_at: new Date(Date.now() - 1000), revoked_at: new Date(),
        })).toBe('revoked');
    });

    it('reads an accepted one as used, even if revoked afterwards', () => {
        // Acceptance is the one irreversible step: once it has happened, that is the answer,
        // whatever else was done to the row later.
        expect(classifyInvitation({
            ...base(), accepted_at: new Date(), revoked_at: new Date(),
        })).toBe('used');
    });
});
