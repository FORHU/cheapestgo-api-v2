/**
 * Which environment Mystifly is told to run a request against.
 *
 * `Target` and the base URL describe one decision, and they used to be set independently:
 * the host defaulted to the demo endpoint while `Target` defaulted to `Production`. Every
 * environment here leaves `MYSTIFLY_ENV` unset, so every request said Production to a demo
 * host — harmless only for as long as nobody pointed `MYSTIFLY_BASE_URL` somewhere real.
 *
 * So the safe pairing is the one worth pinning: an unconfigured environment must not be
 * able to issue a live booking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.hoisted`, so the object exists before the mock factory runs and a plain static
// import of the module under test still sees it — a top-level `await import` would work
// at runtime but the tsconfig's module target rejects it.
const { config } = vi.hoisted(() => ({ config: {} as Record<string, string | undefined> }));
vi.mock('@/config', () => ({ config }));

import { getMystiflyTarget } from '@/lib/flights/mystifly';

const DEMO = 'https://restapidemo.myfarebox.com';
const LIVE = 'https://restapi.myfarebox.com';

describe('getMystiflyTarget', () => {
    beforeEach(() => {
        delete config.MYSTIFLY_ENV;
        delete config.MYSTIFLY_BASE_URL;
    });

    it('is Test when nothing is configured at all', () => {
        // The case that shipped as Production.
        expect(getMystiflyTarget()).toBe('Test');
    });

    it('follows the host when the environment is not declared', () => {
        config.MYSTIFLY_BASE_URL = DEMO;
        expect(getMystiflyTarget()).toBe('Test');

        config.MYSTIFLY_BASE_URL = LIVE;
        expect(getMystiflyTarget()).toBe('Production');
    });

    it('lets an explicit setting win over the host', () => {
        config.MYSTIFLY_ENV = 'test';
        config.MYSTIFLY_BASE_URL = LIVE;
        expect(getMystiflyTarget()).toBe('Test');

        config.MYSTIFLY_ENV = 'Production';
        config.MYSTIFLY_BASE_URL = DEMO;
        expect(getMystiflyTarget()).toBe('Production');
    });

    it('does not read an unrecognised setting as permission to go live', () => {
        config.MYSTIFLY_ENV = 'staging';
        expect(getMystiflyTarget()).toBe('Test');
    });
});
