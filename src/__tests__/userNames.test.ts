import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkName, clampName, NAME_MAX_LENGTH } from '@/lib/users/names';
import { UsersService } from '@/services/users.service';

/**
 * C4: the account holder's own name.
 *
 * v1 capped nothing, and a live profile was stored with a 13,708-character first name (QA BG-9),
 * which rendered as a wall of text wherever that account appeared. The cap is enforced where the
 * writes happen — register, profile update — and merely trimmed where the name comes from
 * someone else's system, because refusing a Google sign-in over a long name is the wrong answer.
 */

describe('checkName', () => {
    it('accepts an ordinary name and stores it trimmed', () => {
        expect(checkName('  Ana  ', 'First name')).toEqual({ ok: true, value: 'Ana' });
    });

    it('refuses an empty one, in the words of the field', () => {
        expect(checkName('   ', 'Last name')).toMatchObject({ ok: false, error: 'Last name is required' });
    });

    it('refuses one past the cap', () => {
        const long = 'a'.repeat(NAME_MAX_LENGTH + 1);
        expect(checkName(long, 'First name')).toMatchObject({
            ok: false,
            error: `First name must be ${NAME_MAX_LENGTH} characters or fewer`,
        });
    });

    it('accepts one exactly at the cap — the long real names already stored must still fit', () => {
        expect(checkName('a'.repeat(NAME_MAX_LENGTH), 'First name').ok).toBe(true);
    });
});

describe('clampName', () => {
    it('trims a name from another system rather than refusing it', () => {
        expect(clampName('a'.repeat(100))).toHaveLength(NAME_MAX_LENGTH);
    });

    it('treats nothing, or nothing but spaces, as no name at all', () => {
        expect(clampName(undefined)).toBeNull();
        expect(clampName('   ')).toBeNull();
    });
});

describe('UsersService.updateProfile', () => {
    const repo = {
        findPreferences: vi.fn(),
        savePreferences: vi.fn(),
        findPasswordHash: vi.fn(),
        savePasswordHash: vi.fn(),
        saveName: vi.fn(async (_id: string, names: { firstName?: string; lastName?: string }) => ({
            first_name: names.firstName ?? 'Ana',
            last_name:  names.lastName  ?? 'Reyes',
        })),
    };
    const service = new UsersService(repo as never);

    beforeEach(() => vi.clearAllMocks());

    it('refuses a name past the cap before it reaches the database', async () => {
        await expect(service.updateProfile('user-1', 'a'.repeat(13_708))).rejects.toThrow(/30 characters or fewer/);
        expect(repo.saveName).not.toHaveBeenCalled();
    });

    it('updates one field without blanking the other', async () => {
        await service.updateProfile('user-1', undefined, 'Reyes');
        expect(repo.saveName).toHaveBeenCalledWith('user-1', { lastName: 'Reyes' });
    });

    it('refuses a request that changes nothing', async () => {
        await expect(service.updateProfile('user-1')).rejects.toThrow(/Nothing to update/);
    });
});
