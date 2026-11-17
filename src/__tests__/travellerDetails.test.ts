import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkBirthDate, checkNationality, checkPhone } from '@/lib/users/travellerDetails';
import { UsersService } from '@/services/users.service';

/**
 * Birth date, phone and nationality against the account. See mobile #62.
 *
 * These columns existed and nothing ever wrote them: `birth_date`, `profiles.phone` and
 * `profiles.nationality` appeared only as per-passenger fields on a flight order, which is a
 * different thing entirely — those describe who is flying on one trip. These describe the
 * account holder, so a later booking does not ask twice.
 */

const NOW = new Date('2026-11-16T02:00:00.000Z');

describe('birth date', () => {
    it('accepts a plain calendar date', () => {
        expect(checkBirthDate('1990-07-14', NOW)).toEqual({ ok: true, value: '1990-07-14' });
    });

    it('refuses a day that is not on the calendar', () => {
        // The reason the check round-trips instead of pattern-matching the parts: Date rolls
        // this forward to 2 March rather than refusing it, and a regex sees nothing wrong.
        const result = checkBirthDate('2025-02-30', NOW);
        expect(result.ok).toBe(false);
        expect(result.error).toBe('Enter a real date');
    });

    it('refuses a date in the future', () => {
        expect(checkBirthDate('2027-01-01', NOW).error).toBe('Birth date cannot be in the future');
    });

    it('accepts today, which is a real birth date for a few hours', () => {
        expect(checkBirthDate('2026-11-16', NOW).ok).toBe(true);
    });

    it('refuses a year that can only be a typo', () => {
        expect(checkBirthDate('1890-01-01', NOW).error).toBe('Check the year of birth');
    });

    it('insists on the format rather than guessing', () => {
        // 07/14/1990 and 14/07/1990 are the same string to a parser and different days.
        expect(checkBirthDate('14/07/1990', NOW).error).toBe('Birth date must be in YYYY-MM-DD format');
    });
});

describe('phone', () => {
    it('keeps an E.164 number as it is', () => {
        expect(checkPhone('+639171234567')).toEqual({ ok: true, value: '+639171234567' });
    });

    it('drops the punctuation people write numbers with', () => {
        expect(checkPhone('+63 (917) 123-4567').value).toBe('+639171234567');
    });

    it('refuses a national number rather than guessing a country', () => {
        // 09171234567 is a Philippine mobile and also a plausible number elsewhere. Picking a
        // default country gets it wrong for the travellers least likely to spot it.
        const result = checkPhone('09171234567');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('country code');
    });

    it('refuses something too short to be a number', () => {
        expect(checkPhone('+123').ok).toBe(false);
    });
});

describe('nationality', () => {
    it('upper-cases a two-letter code', () => {
        expect(checkNationality('ph')).toEqual({ ok: true, value: 'PH' });
    });

    it('refuses a country name', () => {
        expect(checkNationality('Philippines').error).toBe('Nationality must be a two-letter country code');
    });

    it('accepts a code we hold no list for', () => {
        // Deliberate: the list of valid codes changes, and refusing a real country because our
        // copy is stale is worse than storing one no supplier recognises.
        expect(checkNationality('ZZ').ok).toBe(true);
    });
});

describe('saving details', () => {
    const repo = { findDetails: vi.fn(), saveDetails: vi.fn() };
    const svc = new UsersService(repo as never);

    beforeEach(() => {
        repo.saveDetails.mockReset().mockResolvedValue({});
        repo.findDetails.mockReset();
    });

    it('writes only the fields that were sent', async () => {
        // Onboarding lets a traveller skip this step, and a profile screen may know about one
        // field, so one field arriving alone is the normal case rather than a half-filled form.
        await svc.updateDetails('user-1', { phone: '+639171234567' });

        expect(repo.saveDetails).toHaveBeenCalledWith('user-1', { phone: '+639171234567' });
    });

    it('stores the normalised value, not what was typed', async () => {
        await svc.updateDetails('user-1', { nationality: 'ph', phone: '+63 917 123 4567' });

        expect(repo.saveDetails).toHaveBeenCalledWith('user-1', {
            phone:       '+639171234567',
            nationality: 'PH',
        });
    });

    it('writes nothing when any field is bad', async () => {
        // Checked before anything is written: a bad nationality must not leave a birth date
        // stored and an error on screen, with no way to tell which half landed.
        await expect(
            svc.updateDetails('user-1', { birthDate: '1990-07-14', nationality: 'Philippines' }),
        ).rejects.toThrow('Nationality must be a two-letter country code');

        expect(repo.saveDetails).not.toHaveBeenCalled();
    });

    it('refuses an empty request rather than writing nothing quietly', async () => {
        await expect(svc.updateDetails('user-1', {})).rejects.toThrow('Nothing to update');
    });
});
