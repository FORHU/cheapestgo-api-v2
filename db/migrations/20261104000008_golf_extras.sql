-- migrate:up
-- Golf extras (CONTEXT.md, "Golf Booking"): club rental, a caddie or a cart, added to a tee time at
-- checkout at a price per item the course sets. Not offered means no row.
--
-- A hold copies its priced lines onto the booking, so a later price change never changes what a
-- customer was quoted. Like the booking itself, a line keeps both sides of the money: what the course
-- asks in its own currency, and what the customer pays in theirs.
--
-- Restated for v2 from v1's 20261005000002 and 20261018000001 (cheapest-go-app, feat/golf-courses),
-- not copied: dbmate keys on version alone and the two repos' numbers already collide.
--
-- Additive only, and re-running it by hand is harmless.

CREATE TABLE IF NOT EXISTS golf_course_extras (
    course_id  uuid          NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
    code       text          NOT NULL,
    -- Per item, in the course's currency.
    price      numeric(12,2) NOT NULL,
    created_at timestamptz   NOT NULL DEFAULT now(),
    updated_at timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, code),
    CONSTRAINT golf_course_extras_code_check  CHECK (code IN ('club_rental', 'caddie', 'cart')),
    CONSTRAINT golf_course_extras_price_check CHECK (price >= 0)
);

CREATE TABLE IF NOT EXISTS golf_booking_extras (
    booking_id uuid          NOT NULL REFERENCES golf_bookings(id) ON DELETE CASCADE,
    code       text          NOT NULL,
    quantity   integer       NOT NULL,
    -- What the course asks per item, in its own currency.
    unit_price numeric(12,2) NOT NULL,
    -- What the customer pays for the line, in the booking's charge currency.
    total      numeric(14,2) NOT NULL,
    PRIMARY KEY (booking_id, code),
    CONSTRAINT golf_booking_extras_code_check     CHECK (code IN ('club_rental', 'caddie', 'cart')),
    CONSTRAINT golf_booking_extras_quantity_check CHECK (quantity BETWEEN 1 AND 4),
    CONSTRAINT golf_booking_extras_amounts_check  CHECK (unit_price >= 0 AND total >= 0)
);

-- In the charge currency: green_fee + extras_total + service_fee = total.
ALTER TABLE golf_bookings ADD COLUMN IF NOT EXISTS extras_total numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_extras_total_check;
ALTER TABLE golf_bookings ADD CONSTRAINT golf_bookings_extras_total_check CHECK (extras_total >= 0);

-- migrate:down
ALTER TABLE golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_extras_total_check;
ALTER TABLE golf_bookings DROP COLUMN IF EXISTS extras_total;
DROP TABLE IF EXISTS golf_booking_extras;
DROP TABLE IF EXISTS golf_course_extras;
