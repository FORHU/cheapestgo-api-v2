import { AppError } from '@/middleware/error.middleware';

/**
 * bcrypt reads the first 72 bytes of a password and ignores the rest, so two passwords that
 * agree up to byte 72 are the same password to it. A longer passphrase is therefore weaker
 * than the person who chose it believes, and a non-ASCII one reaches the cut sooner, at two
 * to four bytes a character.
 *
 * Refusing it at the door is the honest fix: accepting a password we will only half read is
 * the bug. It is checked where a password is *set* — register, reset, change — and never at
 * sign-in, so an account that already has a longer one keeps working until its next reset.
 */
export const PASSWORD_MAX_BYTES = 72;

export function assertPasswordFitsBcrypt(password: string, label = 'Password'): void {
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
        throw new AppError(
            400,
            `${label} must be ${PASSWORD_MAX_BYTES} bytes or fewer. Characters outside the basic alphabet count as more than one.`,
            'VALIDATION_ERROR',
        );
    }
}
