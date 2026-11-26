import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every migration is one dbmate can run.
 *
 * The deploy applies these on the box, out of the image it just pulled, with
 * `dbmate --no-dump-schema up`. dbmate reads a file by its `-- migrate:up` marker and a file
 * without one contributes nothing — no error, no warning, and the version still gets recorded
 * as applied. The deploy goes green, the schema does not change, and the code that expected
 * the change fails at runtime instead.
 *
 * That is not hypothetical: `20261126000001_hotel_content_name_trgm.sql` was written without
 * the marker and would have shipped as a successful no-op.
 */
const DIR = join(__dirname, '..', '..', 'db', 'migrations');

const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');

describe('db/migrations', () => {
    it('has migrations to check', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it.each(files)('%s declares an up section dbmate can find', (file) => {
        expect(read(file)).toMatch(/^-- migrate:up/m);
    });

    /**
     * The version dbmate records is the filename's leading timestamp, and it is the primary key
     * of schema_migrations. Two files sharing one, or a file without one, collide silently:
     * the second is skipped forever because the first already claimed the version.
     */
    it.each(files)('%s is named for a unique version', (file) => {
        expect(file).toMatch(/^\d{14}_/);
    });

    it('no two migrations claim the same version', () => {
        const versions = files.map(f => f.slice(0, 14));
        expect(new Set(versions).size).toBe(versions.length);
    });

    /**
     * CONCURRENTLY is refused inside a transaction, and dbmate opens one per section unless
     * told not to. The failure is at apply time, on whichever database is deployed to first.
     */
    it.each(files)('%s runs CONCURRENTLY outside a transaction, or not at all', (file) => {
        const sql = read(file);
        if (!/CONCURRENTLY/i.test(sql)) return;

        for (const section of ['up', 'down'] as const) {
            const header = new RegExp(`^-- migrate:${section}(.*)$`, 'm').exec(sql);
            if (!header) continue;
            const body = sql.split(new RegExp(`^-- migrate:${section}.*$`, 'm'))[1]?.split(/^-- migrate:/m)[0] ?? '';
            if (!/CONCURRENTLY/i.test(body)) continue;

            expect(header[1]).toContain('transaction:false');
        }
    });
});
