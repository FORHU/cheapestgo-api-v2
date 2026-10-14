/**
 * GET /api/v2/weather?lat=xx&lng=xx
 *
 * Proxies the Google Maps Platform Weather API and normalises the response.
 * Falls back to mock data when the key is missing or the API rejects.
 */

import { Router, Request, Response } from 'express';
import { config } from '@/config';

const router = Router();

const GOOGLE_WEATHER_BASE = 'https://weather.googleapis.com/v1';

const MOCK_WEATHER = {
    current: {
        temp: 22, feelsLike: 24, humidity: 65,
        windSpeed: 12, windDirection: 180, windCardinal: 'S',
        description: 'Partly Cloudy (Mock)', type: 'PARTLY_CLOUDY',
        iconUrl: 'https://www.gstatic.com/images/icons/material/apps/weather/2x/partly_cloudy_day_dark_48dp.png',
        isDay: true, uvIndex: 4, cloudCover: 40, visibility: 10,
    },
    hourly: Array.from({ length: 12 }, (_, i) => ({
        time:         new Date(Date.now() + i * 3_600_000).toISOString(),
        hour:         (new Date().getHours() + i) % 24,
        temp:         Math.round(20 + Math.sin(i / 2) * 5),
        iconUrl:      'https://www.gstatic.com/images/icons/material/apps/weather/2x/partly_cloudy_day_dark_48dp.png',
        description:  'Partly Cloudy',
        precipChance: 10,
    })),
    daily: Array.from({ length: 3 }, (_, i) => ({
        date:         new Date(Date.now() + i * 86_400_000).toISOString().split('T')[0],
        tempMax:      25 + i,
        tempMin:      18 - i,
        iconUrl:      'https://www.gstatic.com/images/icons/material/apps/weather/2x/partly_cloudy_day_dark_48dp.png',
        description:  'Mostly Sunny',
        sunrise:      new Date(new Date(Date.now() + i * 86_400_000).setHours(6, 0, 0, 0)).toISOString(),
        sunset:       new Date(new Date(Date.now() + i * 86_400_000).setHours(19, 0, 0, 0)).toISOString(),
        uvIndex:      6,
        precipChance: 5,
    })),
    units: { temp: '°C', windSpeed: 'km/h' },
    timezone: 'UTC',
};

router.get('/', async (req: Request, res: Response) => {
    const lat = req.query.lat as string | undefined;
    const lng = req.query.lng as string | undefined;

    if (!lat || !lng) {
        return res.status(400).json({ error: 'Missing lat/lng parameters' });
    }

    const apiKey = config.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        return res.json(MOCK_WEATHER);
    }

    try {
        const [currentRes, dailyRes, hourlyRes] = await Promise.all([
            fetch(`${GOOGLE_WEATHER_BASE}/currentConditions:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}`),
            fetch(`${GOOGLE_WEATHER_BASE}/forecast/days:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&days=3`),
            fetch(`${GOOGLE_WEATHER_BASE}/forecast/hours:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&hours=12`),
        ]);

        if (!currentRes.ok) {
            if (currentRes.status === 403 || currentRes.status === 404) {
                return res.json(MOCK_WEATHER);
            }
            throw new Error(`Google Weather API error: ${currentRes.status}`);
        }

        const current    = await currentRes.json() as any;
        const dailyData  = dailyRes.ok  ? await dailyRes.json()  as any : null;
        const hourlyData = hourlyRes.ok ? await hourlyRes.json() as any : null;

        const iconUrl = (base: string | undefined) => base ? `${base}.svg` : null;

        const hourly = (hourlyData?.forecastHours ?? []).slice(0, 12).map((h: any) => {
            const t = new Date(h.interval?.startTime || h.displayDateTime);
            return {
                time:         h.interval?.startTime || h.displayDateTime,
                hour:         isNaN(t.getHours()) ? 0 : t.getHours(),
                temp:         Math.round(h.temperature?.degrees ?? 0),
                iconUrl:      iconUrl(h.weatherCondition?.iconBaseUri),
                description:  h.weatherCondition?.description?.text || '',
                precipChance: h.precipitation?.probability?.percent ?? 0,
            };
        });

        const daily = (dailyData?.forecastDays ?? []).slice(0, 3).map((d: any) => {
            const day   = d.daytimeForecast   || {};
            const night = d.nighttimeForecast || {};
            return {
                date:         d.interval?.startTime?.split('T')[0] || d.displayDate,
                tempMax:      Math.round(d.maxTemperature?.degrees ?? day.temperature?.degrees ?? 0),
                tempMin:      Math.round(d.minTemperature?.degrees ?? night.temperature?.degrees ?? 0),
                iconUrl:      iconUrl(day.weatherCondition?.iconBaseUri ?? d.weatherCondition?.iconBaseUri),
                description:  day.weatherCondition?.description?.text || d.weatherCondition?.description?.text || '',
                sunrise:      d.sunrise,
                sunset:       d.sunset,
                uvIndex:      d.maxUvIndex ?? day.uvIndex ?? null,
                precipChance: d.precipitation?.probability?.percent ?? day.precipitation?.probability?.percent ?? 0,
            };
        });

        res.set('Cache-Control', 'public, max-age=900');
        return res.json({
            current: {
                temp:         Math.round(current.temperature?.degrees ?? 0),
                feelsLike:    Math.round(current.feelsLikeTemperature?.degrees ?? 0),
                humidity:     current.relativeHumidity ?? 0,
                windSpeed:    Math.round(current.wind?.speed?.value ?? 0),
                windDirection: current.wind?.direction?.degrees ?? 0,
                windCardinal: current.wind?.direction?.cardinal || '',
                description:  current.weatherCondition?.description?.text || 'Unknown',
                type:         current.weatherCondition?.type || '',
                iconUrl:      iconUrl(current.weatherCondition?.iconBaseUri),
                isDay:        current.isDaytime ?? true,
                uvIndex:      current.uvIndex ?? null,
                cloudCover:   current.cloudCover ?? null,
                visibility:   current.visibility?.distance ?? null,
            },
            hourly,
            daily,
            units: {
                temp:      current.temperature?.unit === 'FAHRENHEIT' ? '°F' : '°C',
                windSpeed: current.wind?.speed?.unit === 'MILES_PER_HOUR' ? 'mph' : 'km/h',
            },
            timezone: current.timeZone?.id || '',
        });
    } catch (err) {
        console.error('[weather]', err);
        return res.json(MOCK_WEATHER);
    }
});

export default router;
