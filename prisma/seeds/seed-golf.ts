/**
 * prisma/seeds/seed-golf.ts
 *
 * Ten demo golf courses for local development — published, with weekday and weekend tee-time
 * schedules — so the landing page's Golf search, /golf and the course pages have something real
 * to show. The courses are invented; none is a real club.
 *
 * Goes through the same services the admin screen does — input validation, slugs, schedules,
 * tee-time generation, and "published means bookable" — rather than writing rows by hand, so a
 * demo course is exactly what an admin would have made.
 *
 * Safe by default:
 *   - **Local databases only.** It says which database it is pointed at, and refuses one that is
 *     not on this machine unless given `--allow-remote`.
 *   - **Idempotent.** A course whose slug is already taken is left as it is, so a re-run only
 *     fills in what is missing.
 *   - **`--remove` takes them out again**: exactly these slugs, and with them their schedules and
 *     tee times (both cascade).
 *
 * Usage (from the api-v2 root; outside src/ so the nodemon dev server does not restart):
 *   npx ts-node --transpile-only -r tsconfig-paths/register prisma/seeds/seed-golf.ts
 *   npx ts-node --transpile-only -r tsconfig-paths/register prisma/seeds/seed-golf.ts --remove
 *
 * Photos are Unsplash's (free to use under the Unsplash licence), linked rather than copied, as an
 * admin would paste them.
 */

import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { golfCourseInputSchema, type GolfAmenity } from '@/lib/golf/courseInput';
import { scheduleInputSchema } from '@/lib/golf/scheduleInput';
import { GolfRepository } from '@/repositories/golf.repository';
import { GolfService } from '@/services/golf.service';
import { GolfTeeTimesService } from '@/services/golfTeeTimes.service';

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

const PHOTOS = {
    swingHills:    photo('1535131749006-b7f58c99034b'),
    swingValley:   photo('1535132011086-b8818f016104'),
    swingSunny:    photo('1611374243147-44a702c2d44c'),
    links:         photo('1592919505780-303950717480'),
    aerialBunkers: photo('1500932334442-8761ee4810a7'),
    fairwayFlag:   photo('1632946269126-0f8edbe8b068'),
    ballAtHole:    photo('1587174486073-ae5e5cff23aa'),
    flagAndBall:   photo('1584837140804-599306fb37f9'),
    clubAndBall:   photo('1593111774240-d529f12cf4bb'),
    clubsInBag:    photo('1530028828-25e8270793c5'),
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

interface DemoCourse {
    slug: string;
    name: string;
    country: string;
    city: string;
    address: string;
    description: string;
    holes: 9 | 18 | 27 | 36;
    par: number;
    currency: string;
    timezone: string;
    bookingWindowDays: number;
    amenities: GolfAmenity[];
    imageUrls: string[];
    /** First and last tee, as "HH:MM" on the course's clock. */
    tees: { first: string; last: string };
    /** Per player, in the course's currency. The weekday rate is also the "from" green fee. */
    price: { weekday: number; weekend: number };
}

const COURSES: DemoCourse[] = [
    {
        slug: 'hallasan-ridge-golf-club',
        name: 'Hallasan Ridge Golf Club',
        country: 'South Korea', city: 'Jeju', address: 'Sallanghwa-ro, Jeju-si, Jeju-do',
        description: 'Laid across the lower slopes of Hallasan, with the volcano behind the first tee and the sea beyond the eighteenth green.\n\nWide, rolling fairways reward a long drive; the volcanic-rock bunkers and the mountain breezes keep the approach honest.',
        holes: 18, par: 72, currency: 'KRW', timezone: 'Asia/Seoul', bookingWindowDays: 30,
        amenities: ['caddie', 'cart', 'driving_range', 'clubhouse', 'restaurant'],
        imageUrls: [PHOTOS.swingValley, PHOTOS.aerialBunkers, PHOTOS.flagAndBall],
        tees: { first: '06:30', last: '14:30' }, price: { weekday: 180000, weekend: 240000 },
    },
    {
        slug: 'yeongjong-links',
        name: 'Yeongjong Links',
        country: 'South Korea', city: 'Incheon', address: 'Yeongjong-daero, Jung-gu, Incheon',
        description: 'Twenty-seven seaside holes twenty minutes from the airport — the easiest round in Korea to fit around a flight.\n\nThree nines of firm, fast links turf, played with the tide and the wind off the Yellow Sea.',
        holes: 27, par: 108, currency: 'KRW', timezone: 'Asia/Seoul', bookingWindowDays: 21,
        amenities: ['caddie', 'cart', 'driving_range', 'putting_green', 'pro_shop'],
        imageUrls: [PHOTOS.links, PHOTOS.ballAtHole, PHOTOS.clubsInBag],
        tees: { first: '06:00', last: '15:00' }, price: { weekday: 150000, weekend: 210000 },
    },
    {
        slug: 'seoul-forest-nine',
        name: 'Seoul Forest Nine',
        country: 'South Korea', city: 'Seoul', address: 'Ttukseom-ro, Seongdong-gu, Seoul',
        description: 'A floodlit nine in the middle of the city, built for a round after work.\n\nShort, tight par-fours and two water carries make it a test of the irons rather than the driver.',
        holes: 9, par: 36, currency: 'KRW', timezone: 'Asia/Seoul', bookingWindowDays: 14,
        amenities: ['night_golf', 'driving_range', 'lessons', 'club_rental'],
        imageUrls: [PHOTOS.clubAndBall, PHOTOS.fairwayFlag],
        tees: { first: '07:00', last: '21:00' }, price: { weekday: 60000, weekend: 80000 },
    },
    {
        slug: 'caldera-ridge-golf-club',
        name: 'Caldera Ridge Golf Club',
        country: 'Philippines', city: 'Tagaytay', address: 'Tagaytay–Nasugbu Highway, Tagaytay, Cavite',
        description: 'High on the ridge above the lake, where the air is cool enough to play at noon.\n\nElevated tees and steep, sloping greens; the views across the caldera are worth the walk between holes.',
        holes: 18, par: 72, currency: 'PHP', timezone: 'Asia/Manila', bookingWindowDays: 30,
        amenities: ['caddie', 'cart', 'clubhouse', 'restaurant', 'putting_green'],
        imageUrls: [PHOTOS.swingHills, PHOTOS.links, PHOTOS.ballAtHole],
        tees: { first: '05:30', last: '14:30' }, price: { weekday: 4500, weekend: 6200 },
    },
    {
        slug: 'coral-bay-links',
        name: 'Coral Bay Links',
        country: 'Philippines', city: 'Lapu-Lapu', address: 'Punta Engaño Road, Lapu-Lapu, Cebu',
        description: 'An island course a short ride from the Cebu resorts, with five holes along the shore.\n\nPalm-lined fairways, sea breezes and greens that break towards the water.',
        holes: 18, par: 71, currency: 'PHP', timezone: 'Asia/Manila', bookingWindowDays: 45,
        amenities: ['caddie', 'cart', 'club_rental', 'restaurant', 'pro_shop'],
        imageUrls: [PHOTOS.fairwayFlag, PHOTOS.swingSunny, PHOTOS.flagAndBall],
        tees: { first: '05:30', last: '15:00' }, price: { weekday: 5200, weekend: 6800 },
    },
    {
        slug: 'pampanga-plains-golf-club',
        name: 'Pampanga Plains Golf Club',
        country: 'Philippines', city: 'Clark', address: 'Clark Freeport Zone, Angeles, Pampanga',
        description: 'Thirty-six holes on open lahar plains, ten minutes from Clark International Airport.\n\nTwo full courses: the parkland East for a relaxed round, the bunker-heavy West for a harder one — and floodlights on both for evening play.',
        holes: 36, par: 144, currency: 'PHP', timezone: 'Asia/Manila', bookingWindowDays: 60,
        amenities: ['caddie', 'cart', 'driving_range', 'putting_green', 'lessons', 'night_golf'],
        imageUrls: [PHOTOS.aerialBunkers, PHOTOS.clubAndBall, PHOTOS.swingHills],
        tees: { first: '05:30', last: '18:00' }, price: { weekday: 3800, weekend: 5000 },
    },
    {
        slug: 'fuji-lakeside-golf-club',
        name: 'Fuji Lakeside Golf Club',
        country: 'Japan', city: 'Gotemba', address: 'Nakabata, Gotemba, Shizuoka',
        description: 'Fuji fills the sky above half the holes here, mirrored in the lake on the back nine.\n\nA traditional Japanese round: nine holes, lunch at the clubhouse, then nine more.',
        holes: 18, par: 72, currency: 'JPY', timezone: 'Asia/Tokyo', bookingWindowDays: 60,
        amenities: ['cart', 'clubhouse', 'restaurant', 'pro_shop'],
        imageUrls: [PHOTOS.swingSunny, PHOTOS.fairwayFlag, PHOTOS.clubsInBag],
        tees: { first: '07:00', last: '13:30' }, price: { weekday: 12000, weekend: 18500 },
    },
    {
        slug: 'birch-hills-golf-club',
        name: 'Birch Hills Golf Club',
        country: 'Japan', city: 'Kutchan', address: 'Yamada, Kutchan, Abuta District, Hokkaido',
        description: 'A summer course in the Niseko hills, cut through birch woods under Mount Yotei.\n\nCool mornings, long views and bent-grass greens that run true all season.',
        holes: 18, par: 72, currency: 'JPY', timezone: 'Asia/Tokyo', bookingWindowDays: 30,
        amenities: ['cart', 'club_rental', 'clubhouse'],
        imageUrls: [PHOTOS.flagAndBall, PHOTOS.swingValley],
        tees: { first: '06:30', last: '14:00' }, price: { weekday: 9500, weekend: 13000 },
    },
    {
        slug: 'andaman-coast-golf-club',
        name: 'Andaman Coast Golf Club',
        country: 'Thailand', city: 'Phuket', address: 'Srisoonthorn Road, Thalang, Phuket',
        description: 'Former tin-mining land turned lakes and fairways, between the hills and the Andaman Sea.\n\nWater comes into play on eleven holes; the caddies know every one of them.',
        holes: 18, par: 72, currency: 'THB', timezone: 'Asia/Bangkok', bookingWindowDays: 45,
        amenities: ['caddie', 'cart', 'driving_range', 'restaurant'],
        imageUrls: [PHOTOS.ballAtHole, PHOTOS.aerialBunkers, PHOTOS.swingSunny],
        tees: { first: '06:00', last: '15:00' }, price: { weekday: 3500, weekend: 4500 },
    },
    {
        slug: 'son-tra-dunes-golf-club',
        name: 'Son Tra Dunes Golf Club',
        country: 'Vietnam', city: 'Da Nang', address: 'Truong Sa, Ngu Hanh Son, Da Nang',
        description: 'Links holes through the white sand dunes south of Da Nang, with the Marble Mountains inland.\n\nFirm and fast in the dry season; play early, before the afternoon wind comes off the sea.',
        holes: 18, par: 72, currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', bookingWindowDays: 30,
        amenities: ['caddie', 'cart', 'clubhouse', 'restaurant', 'lessons'],
        imageUrls: [PHOTOS.clubsInBag, PHOTOS.links, PHOTOS.swingHills],
        tees: { first: '06:00', last: '15:00' }, price: { weekday: 2500000, weekend: 3200000 },
    },
];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']);

/** Where DATABASE_URL points, without its credentials, and whether that is this machine. */
function target(): { label: string; local: boolean } {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error('DATABASE_URL is not set (looked in the environment and .env).');
    const url = new URL(raw);
    return { label: `${url.hostname}:${url.port || '5432'}${url.pathname}`, local: LOCAL_HOSTS.has(url.hostname) };
}

async function seed() {
    const repo = new GolfRepository();
    const golf = new GolfService(repo);
    const teeTimes = new GolfTeeTimesService();

    for (const demo of COURSES) {
        if (await repo.findBySlug(demo.slug)) {
            console.log(`· ${demo.name} — already there, left as it is`);
            continue;
        }

        const course = await golf.create(golfCourseInputSchema.parse({
            slug: demo.slug,
            name: demo.name,
            country: demo.country,
            city: demo.city,
            address: demo.address,
            description: demo.description,
            holes: demo.holes,
            par: demo.par,
            greenFeeFrom: demo.price.weekday,
            currency: demo.currency,
            imageUrls: demo.imageUrls,
            amenities: demo.amenities,
            timezone: demo.timezone,
            bookingWindowDays: demo.bookingWindowDays,
        }));

        let made = 0;
        for (const s of [
            { name: 'Weekdays', daysOfWeek: WEEKDAYS, intervalMinutes: 10, pricePerPlayer: demo.price.weekday },
            { name: 'Weekends', daysOfWeek: WEEKEND, intervalMinutes: 8, pricePerPlayer: demo.price.weekend },
        ]) {
            const added = await teeTimes.addSchedule(course.id, scheduleInputSchema.parse({
                ...s, firstTee: demo.tees.first, lastTee: demo.tees.last, spots: 4,
            }));
            made += added?.created ?? 0;
        }

        await golf.setStatus(course.id, 'published');
        console.log(`✓ ${demo.name} (${demo.city}, ${demo.country}) — /golf/${demo.slug}, ${made} tee times`);
    }
}

async function remove() {
    const repo = new GolfRepository();
    for (const demo of COURSES) {
        const course = await repo.findBySlug(demo.slug);
        if (!course) continue;
        await repo.delete(course.id);
        console.log(`✗ ${demo.name} — removed, with its schedules and tee times`);
    }
}

async function main() {
    const args = new Set(process.argv.slice(2));
    const db = target();
    console.log(`Database: ${db.label}${db.local ? '' : '  (NOT LOCAL)'}`);
    if (!db.local && !args.has('--allow-remote')) {
        throw new Error('Refusing to write demo courses to a database that is not on this machine. Pass --allow-remote if you mean it.');
    }
    if (args.has('--remove')) await remove();
    else await seed();
}

main()
    .catch((err) => {
        console.error('Golf seed failed:', err?.message ?? err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        // The services' imports (rates, logger) can hold the event loop open; the work is done.
        process.exit(process.exitCode ?? 0);
    });
