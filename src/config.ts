import { z } from 'zod';

const schema = z.object({
    NODE_ENV:                  z.enum(['development', 'production', 'test']).default('development'),
    PORT:                      z.coerce.number().default(4000),
    DATABASE_URL:              z.string().min(1),
    REDIS_URL:                 z.string().default('redis://localhost:6379'),
    CORS_ORIGIN:               z.string().default('http://localhost:3000'),
    JWT_SECRET:                z.string().min(1),
    JWT_EXPIRES_IN:            z.string().default('1d'),
    JWT_REFRESH_SECRET:        z.string().min(1),
    JWT_REFRESH_EXPIRES_IN:    z.string().default('7d'),
    COOKIE_SECRET:             z.string().min(1),
    STRIPE_SECRET_KEY:         z.string().min(1),
    STRIPE_WEBHOOK_SECRET:     z.string().optional(),
    DUFFEL_ACCESS_TOKEN:       z.string().optional(),
    MYSTIFLY_USERNAME:         z.string().optional(),
    MYSTIFLY_PASSWORD:         z.string().optional(),
    MYSTIFLY_ACCOUNT_NUMBER:   z.string().optional(),
    TRAVELGATEX_API_KEY:       z.string().optional(),
    TRAVELGATEX_CODE:          z.string().optional(),
    ONDA_SECRET_KEY:           z.string().optional(),
    RESEND_API_KEY:            z.string().optional(),
    CRON_SECRET:               z.string().optional(),
    FUNCTIONS_SECRET:          z.string().optional(),
    ANTHROPIC_API_KEY:         z.string().optional(),
    GOOGLE_PLACES_API_KEY:     z.string().optional(),
    GOOGLE_CLIENT_ID:          z.string().optional(),
    GOOGLE_CLIENT_SECRET:      z.string().optional(),
    SITE_URL:                  z.string().default('http://localhost:3000'),
    API_URL:                   z.string().default('http://localhost:4000'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const config = parsed.data;
