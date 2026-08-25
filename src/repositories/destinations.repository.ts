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
}
