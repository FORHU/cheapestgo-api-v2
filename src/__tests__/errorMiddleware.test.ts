import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { AppError, errorMiddleware } from '@/middleware/error.middleware';

/**
 * What a client receives when a request is refused.
 *
 * The prompts that matter most here are the ones a customer has to act on — re-confirm a new
 * price, see the booking a duplicate collides with — and each needs a field beside the
 * message. The handler used to send only `error` and `message`, so every one of them arrived
 * with nothing to show.
 */

function respond(err: Error) {
    let status = 0;
    let body: any;
    const res: any = {
        status: (s: number) => { status = s; return res; },
        json:   (b: unknown) => { body = b; return res; },
    };
    errorMiddleware(err, {} as any, res, () => {});
    return { status, body };
}

describe('errorMiddleware', () => {
    it('sends the details a customer needs to re-confirm a price', () => {
        const { status, body } = respond(
            new AppError(409, 'The price has changed', 'PRICE_CHANGED', { serverPrice: 318.10, currency: 'USD' }),
        );
        expect(status).toBe(409);
        expect(body).toEqual({
            error: 'PRICE_CHANGED',
            message: 'The price has changed',
            serverPrice: 318.10,
            currency: 'USD',
        });
    });

    it('never lets a detail overwrite the code or the message', () => {
        const { body } = respond(
            new AppError(409, 'real message', 'REAL_CODE', { error: 'spoofed', message: 'spoofed' }),
        );
        expect(body.error).toBe('REAL_CODE');
        expect(body.message).toBe('real message');
    });

    it('sends only the code and message when there are no details', () => {
        const { body } = respond(new AppError(404, 'Not found', 'NOT_FOUND'));
        expect(body).toEqual({ error: 'NOT_FOUND', message: 'Not found' });
    });

    it('says nothing about an unexpected error beyond that it happened', () => {
        const { status, body } = respond(new Error('connection string with a password in it'));
        expect(status).toBe(500);
        expect(JSON.stringify(body)).not.toContain('password');
    });
});
