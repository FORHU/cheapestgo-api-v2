import { z } from 'zod';
import { MOCK_SCENARIOS } from '@/lib/hotels/providers/mock/scenarios';

const schema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    // Comma-separated allowlist. Parsed into an array because `cors` treats a
    // string as one exact origin and echoes it back verbatim — a comma-joined
    // string produces an Access-Control-Allow-Origin no browser will accept.
    CORS_ORIGIN: z.string()
        .default('http://localhost:3000')
        .transform(v => v.split(',').map(s => s.trim()).filter(Boolean)),
    JWT_SECRET: z.string().min(1),
    JWT_EXPIRES_IN: z.string().default('1d'),
    JWT_REFRESH_SECRET: z.string().min(1),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    COOKIE_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    DUFFEL_ACCESS_TOKEN: z.string().optional(),
    MYSTIFLY_USERNAME: z.string().optional(),
    MYSTIFLY_PASSWORD: z.string().optional(),
    MYSTIFLY_ACCOUNT_NUMBER: z.string().optional(),
    TRAVELGATEX_API_KEY: z.string().optional(),
    TRAVELGATEX_CODE: z.string().optional(),
    ONDA_SECRET_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    FUNCTIONS_SECRET: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    CHAT_WONDER_API_URL: z.string().default('https://chat-dev.forhu.ai'),
    CHAT_WONDER_API_KEY: z.string().optional(),
    CHAT_WONDER_MODEL: z.string().default('gpt-4o-mini'),
    GOOGLE_PLACES_API_KEY: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    SITE_URL: z.string().default('http://localhost:3000'),
    API_URL: z.string().default('http://localhost:4000'),
    DUFFEL_WEBHOOK_SECRET: z.string().optional(),
    MAPBOX_TOKEN: z.string().optional(),

    // Which hotel supplier this process talks to. `mock` never calls a supplier, and is refused
    // in production unless ALLOW_MOCK_HOTEL_PROVIDER=true.
    HOTEL_PROVIDER: z.enum(['travelgatex', 'mock']).default('travelgatex'),
    ALLOW_MOCK_HOTEL_PROVIDER: z.string().optional(),
    MOCK_HOTEL_SCENARIO: z.enum(MOCK_SCENARIOS).optional(),
    MOCK_HOTEL_CURRENCY: z.string().length(3).optional(),
    // `log` writes the email to the console instead of sending it. Defaults to `log` when the
    // hotel provider is the mock, and to `resend` otherwise.
    EMAIL_TRANSPORT: z.enum(['resend', 'log']).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}

if (
    parsed.data.NODE_ENV === 'production'
    && parsed.data.HOTEL_PROVIDER === 'mock'
    && parsed.data.ALLOW_MOCK_HOTEL_PROVIDER !== 'true'
) {
    console.error('❌ HOTEL_PROVIDER=mock is refused in production: it would charge real cards for reservations that do not exist.');
    console.error('   Set ALLOW_MOCK_HOTEL_PROVIDER=true to override.');
    process.exit(1);
}

export const config = parsed.data;
