-- migrate:up
-- Golf bookings (CONTEXT.md, "Golf Booking"): a customer asks for a tee time and pays for it, and
-- the team confirms it with the course before the card is charged.
--
--   held       spots taken, card being set up; lasts 15 minutes
--   requested  card authorised (manual capture); the team has until decide_by to answer
--   confirmed  the team confirmed with the course and the payment was captured
--   expired    the hold ran out unpaid: authorisation cancelled, spots released
--   declined   the team said no, or did not answer by decide_by: released, never charged
--
-- Priced by the course in its currency and charged in the customer's (v1 ADR-0051): both are kept,
-- with the rate between them, so the charge can always be explained in the course's terms.
--
-- Restated for v2 from v1's 20261005000001 and 20261018000001 (cheapest-go-app, feat/golf-courses),
-- not copied: dbmate keys on version alone and the two repos' numbers already collide.
--
-- Additive only, and re-running it by hand is harmless.

CREATE TABLE IF NOT EXISTS golf_bookings (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    -- CG-XXXXXX (bookingReference), on the PaymentIntent too.
    reference         text          NOT NULL,
    user_id           uuid          NOT NULL REFERENCES users(id),
    -- Restrict: a course or tee time someone has booked is not deleted out from under the booking.
    course_id         uuid          NOT NULL REFERENCES golf_courses(id) ON DELETE RESTRICT,
    tee_time_id       uuid          NOT NULL REFERENCES golf_tee_times(id) ON DELETE RESTRICT,
    players           integer       NOT NULL,
    lead_name         text          NOT NULL,
    contact_email     text          NOT NULL,
    -- What the course asks, in its own currency.
    course_currency   char(3)       NOT NULL,
    price_per_player  numeric(12,2) NOT NULL,
    -- What the customer pays, in the currency they chose, and the rate that got there
    -- (charge-currency units per 1 course-currency unit; 1 when they are the same).
    currency          char(3)       NOT NULL,
    fx_rate           numeric(20,10) NOT NULL,
    green_fee         numeric(14,2) NOT NULL,
    service_fee       numeric(14,2) NOT NULL,
    total             numeric(14,2) NOT NULL,
    payment_intent_id text,
    status            text          NOT NULL DEFAULT 'held',
    hold_expires_at   timestamptz   NOT NULL,
    requested_at      timestamptz,
    decide_by         timestamptz,
    confirmed_at      timestamptz,
    closed_at         timestamptz,
    close_reason      text,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT golf_bookings_reference_key      UNIQUE (reference),
    CONSTRAINT golf_bookings_payment_intent_key UNIQUE (payment_intent_id),
    CONSTRAINT golf_bookings_players_check      CHECK (players BETWEEN 1 AND 4),
    CONSTRAINT golf_bookings_amounts_check
        CHECK (price_per_player >= 0 AND green_fee >= 0 AND service_fee >= 0 AND total >= 0 AND fx_rate > 0),
    CONSTRAINT golf_bookings_status_check
        CHECK (status IN ('held', 'requested', 'confirmed', 'expired', 'declined')),
    CONSTRAINT golf_bookings_close_reason_check
        CHECK (close_reason IS NULL OR close_reason IN ('hold_expired', 'declined_by_team', 'not_confirmed_in_time'))
);

-- One live hold per customer and tee time: asking again returns the hold rather than taking more spots.
CREATE UNIQUE INDEX IF NOT EXISTS golf_bookings_one_live_hold
    ON golf_bookings (user_id, tee_time_id) WHERE status = 'held';

-- What the sweep reads: holds past their expiry, requests past their deadline.
CREATE INDEX IF NOT EXISTS idx_golf_bookings_hold    ON golf_bookings (hold_expires_at) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_golf_bookings_decide  ON golf_bookings (decide_by)       WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS idx_golf_bookings_user    ON golf_bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_golf_bookings_tee     ON golf_bookings (tee_time_id);
CREATE INDEX IF NOT EXISTS idx_golf_bookings_status  ON golf_bookings (status, created_at DESC);

-- migrate:down
DROP TABLE IF EXISTS golf_bookings;
