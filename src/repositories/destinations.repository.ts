import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface CityCoverageRow {
    city:    string;
    country: string;
}

export class DestinationsRepository {
    /**
     * Which of these city names appear in the hotel catalog, with their country.
     * Matched case-insensitively; the caller pairs city with country itself,
     * because a name alone is ambiguous ("Jeju, Ethiopia" is not "Jeju, Korea").
     */
    async findCityCoverage(cityNames: string[]): Promise<CityCoverageRow[]> {
        if (!cityNames.length) return [];
        return prisma.$queryRaw<CityCoverageRow[]>(Prisma.sql`
            SELECT DISTINCT LOWER(city) AS city, LOWER(country) AS country
            FROM hotel_content
            WHERE LOWER(city) = ANY(${cityNames}::text[])
        `);
    }

    /**
     * Whether an area holds any hotels, asked geographically.
     *
     * A province has no `hotel_content` row under its own name — Palawan's hotels
     * are filed as El Nido, Coron and Puerto Princesa — so a coverage check by
     * name always reports it as empty, and it sorts below any city that merely
     * looks like the query. That is why typing "palawan" offered "Palayan", a
     * different city 600 km away, first.
     *
     * Capped with EXISTS: the question is "any at all", not "how many".
     */
    async areaHasHotels(bbox: [number, number, number, number], countryCode?: string): Promise<boolean> {
        const [minLng, minLat, maxLng, maxLat] = bbox;
        const rows = await prisma.$queryRaw<{ present: boolean }[]>(Prisma.sql`
            SELECT EXISTS (
                SELECT 1 FROM hotel_content
                WHERE lat BETWEEN ${minLat} AND ${maxLat}
                  AND lng BETWEEN ${minLng} AND ${maxLng}
                  AND lat <> 0 AND lng <> 0
                  ${countryCode ? Prisma.sql`AND LOWER(country) = LOWER(${countryCode})` : Prisma.empty}
            ) AS present
        `);
        return rows[0]?.present === true;
    }
}
