import { describe, it, expect } from 'vitest';
import {
    hotelCountry, isTerritory, hasLandBorder, storedCountryCodes, landTerritoryOfCity, territoryCityNames,
} from '@/lib/geo/territories';

/**
 * Territories filed under a parent's code. Every case below is a real row pattern from the
 * 2026-09-14 audit of live hotel content (scratch/audit-country-codes.mjs).
 */

describe('land-border territories, by city name (QA BG-8)', () => {
    it.each(['Hong Kong', 'Kowloon', 'Islands District', 'Tsuen Wan', 'Гонконг', ' hong kong '])('CN "%s" is Hong Kong', (city) => {
        expect(hotelCountry('CN', city)).toBe('HK');
    });

    it('Shenzhen, across the border and inside the same box, stays China — with or without coordinates', () => {
        expect(hotelCountry('CN', 'Shenzhen')).toBe('CN');
        expect(hotelCountry('CN', 'Shenzhen', 22.53, 114.05)).toBe('CN');
    });

    it('a Shenzhen hotel filed under the Hong Kong district name "North District" stays China', () => {
        // The Liancheng Hotel, "1008 Wenjin South Road, Luohu District, 518009 Shenzhen".
        expect(hotelCountry('CN', 'North District', 22.541397, 114.13204)).toBe('CN');
    });

    it('a real North District hotel, south of the border, is Hong Kong', () => {
        expect(hotelCountry('CN', 'North District', 22.501, 114.128)).toBe('HK');   // Sheung Shui
        expect(hotelCountry('CN', 'Sha Tin', 22.383, 114.188)).toBe('HK');
    });

    it('Macao by name; Zhuhai next door stays China', () => {
        expect(hotelCountry('CN', 'Taipa')).toBe('MO');
        expect(hotelCountry('CN', 'Zhuhai', 22.2, 113.55)).toBe('CN');
    });

    it('Gibraltar by name; La Línea de la Concepción, touching it, stays Spain', () => {
        expect(hotelCountry('GB', 'Gibraltar', 36.14, -5.35)).toBe('GI');
        expect(hotelCountry('ES', 'La Línea de la Concepción', 36.16, -5.35)).toBe('ES');
    });

    it('a Hong Kong search looks for Kowloon too, never Shenzhen', () => {
        expect(landTerritoryOfCity('Hong Kong')).toBe('HK');
        expect(landTerritoryOfCity('Kowloon', 'HK')).toBe('HK');
        expect(landTerritoryOfCity('Kowloon', 'CN')).toBe('HK');   // the parent's code still finds it
        expect(landTerritoryOfCity('Seoul')).toBeNull();
        // Hong Kong's districts include names that are places elsewhere.
        expect(landTerritoryOfCity('Central', 'PH')).toBeNull();
        expect(landTerritoryOfCity('Eastern', 'US')).toBeNull();
        expect(territoryCityNames('HK')).toEqual(expect.arrayContaining(['hong kong', 'kowloon']));
        expect(territoryCityNames('HK')).not.toContain('shenzhen');
    });
});

describe('islands and overseas territories, by coordinates', () => {
    it.each([
        ['US', 'Tumon', 13.51, 144.80, 'GU'],
        ['FR', 'Saint-Pierre', -21.34, 55.48, 'RE'],
        ['FR', 'Sainte-Anne', 16.23, -61.38, 'GP'],
        ['FR', 'Sainte-Anne', 14.43, -60.88, 'MQ'],
        ['GB', 'Saint Helier', 49.19, -2.11, 'JE'],
        ['GB', 'Sark', 49.43, -2.36, 'GG'],
        ['NL', 'Saint Eustatius', 17.49, -62.98, 'BQ'],
        ['AU', 'Burnt Pine', -29.03, 167.95, 'NF'],
    ])('%s "%s" at %s,%s is %s', (country, city, lat, lng, expected) => {
        expect(hotelCountry(country, city, lat, lng)).toBe(expected);
    });

    it('the parent\'s own hotels with the same names stay put: Saint-Denis outside Paris is France', () => {
        expect(hotelCountry('FR', 'Saint-Denis', 48.93, 2.36)).toBe('FR');
        expect(hotelCountry('US', 'San Juan', 26.19, -98.15)).toBe('US');   // San Juan, Texas
    });

    it('only converts rows filed under the parent: a BVI hotel beside the US Virgin Islands is left alone', () => {
        expect(hotelCountry('VG', 'Road Town', 18.43, -64.62)).toBe('VG');
        expect(hotelCountry('GB', 'Road Town', 18.43, -64.62)).toBe('VG');
    });

    it('no coordinates, no island decision', () => {
        expect(hotelCountry('US', 'Tumon')).toBe('US');
        expect(hotelCountry('US', 'Tumon', 0, 0)).toBe('US');
    });
});

describe('everything else', () => {
    it('leaves ordinary countries and missing values as stored', () => {
        expect(hotelCountry('KR', 'Seoul', 37.56, 126.97)).toBe('KR');
        expect(hotelCountry('MO', 'Macao')).toBe('MO');
        expect(hotelCountry(null, 'Kowloon')).toBe('');
        expect(hotelCountry('CN', null)).toBe('CN');
    });

    it('a territory search also matches rows stored under its parent', () => {
        expect(storedCountryCodes('HK')).toEqual(['hk', 'cn']);
        expect(storedCountryCodes('GI')).toEqual(['gi', 'gb', 'es']);
        expect(storedCountryCodes('KR')).toEqual(['kr']);
    });

    it('knows which territories have a land border', () => {
        expect(isTerritory('GU')).toBe(true);
        expect(isTerritory('FR')).toBe(false);
        expect(hasLandBorder('HK')).toBe(true);
        expect(hasLandBorder('GU')).toBe(false);
    });
});
