import { describe, it, expect } from 'vitest';
import { searchAirports, placeMatchesQuery } from '@/lib/airports';

describe('searchAirports', () => {
    it('offers the airports that serve a city with none of its own', () => {
        // Kyoto has no airport; travellers fly into Osaka's two.
        expect(searchAirports('Kyoto').map(a => a.iata).slice(0, 2)).toEqual(['KIX', 'ITM']);
    });

    it('ranks those airports above a mere substring match while still typing', () => {
        // "kyo" is inside "Tokyo" too, but the traveller is spelling Kyoto.
        const codes = searchAirports('kyo').map(a => a.iata);
        expect(codes.slice(0, 2)).toEqual(['KIX', 'ITM']);
        expect(codes).toContain('NRT');
    });

    it('still finds an airport by its own code first', () => {
        expect(searchAirports('KIX')[0].iata).toBe('KIX');
    });
});

describe('placeMatchesQuery — which supplier suggestions are kept', () => {
    const place = (iata: string, name: string, city: string) => ({ iata, name, city });

    it('drops a fuzzy guess that shares no word with what was typed', () => {
        expect(placeMatchesQuery(place('ACC', 'Kotoka International Airport', 'Accra'), 'Kyoto')).toBe(false);
        expect(placeMatchesQuery(place('BAL', 'Batman Airport', 'Batman'), 'Bali')).toBe(false);
        expect(placeMatchesQuery(place('HAN', 'Noi Bai International Airport', 'Hanoi'), 'Bali')).toBe(false);
    });

    it('keeps a match on the city, a word of the name, or the code', () => {
        expect(placeMatchesQuery(place('DPS', 'Ngurah Rai International Airport', 'Bali'), 'Bali')).toBe(true);
        expect(placeMatchesQuery(place('SWF', 'New York Stewart International Airport', 'Newburgh'), 'new york')).toBe(true);
        expect(placeMatchesQuery(place('KIX', 'Kansai International Airport', 'Osaka'), 'kix')).toBe(true);
        expect(placeMatchesQuery(place('GRU', 'São Paulo–Guarulhos International Airport', 'São Paulo'), 'sao')).toBe(true);
    });

    it('leaves a query in another script to the supplier', () => {
        expect(placeMatchesQuery(place('ICN', 'Incheon International Airport', 'Seoul'), '서울')).toBe(true);
    });
});
