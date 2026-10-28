-- The workflow of a hotel booking attempt, beside the sale it may become.
--
-- `bookings` records a sale: it is written once the supplier has confirmed and the payment has
-- been captured, and trips, invoices, admin and the mobile app all read it. Everything before
-- that moment — and everything that goes wrong on the way to it — lived in a free-form status
-- string or nowhere. A payment that was authorised and then lost its browser had no row at all;
-- a supplier call that timed out left no record of which side of it the money was on.
--
-- These four tables are the attempt. `hotel_bookings` is the aggregate and carries the state
-- machine in src/lib/hotels/lifecycle/stateMachine.ts; `hotel_booking_events` appends one row
-- for every move, with who moved it and why; `hotel_booking_guests` and
-- `hotel_booking_payments` hold what the booking was for and what was authorised for it.
-- The same reference string links an attempt to the `bookings` row it becomes.
--
-- Additive only. No existing table or column changes, and nothing here is read by the app until
-- the code that writes it is deployed — the code degrades to today's behaviour while these
-- tables are absent, so deploying before applying is safe, and so is applying before deploying.
--
-- Indexes that matter:
--   * booking_reference and payment_intent_id are unique. The second is the backstop for the
--     claim in the code (`UPDATE ... WHERE status = 'PAYMENT_AUTHORIZED'`): two callers racing
--     to complete one payment cannot both create it.
--   * (user_id, prebook_ref) is unique only while the attempt is in flight, so a traveller who
--     abandons a payment and tries again is not blocked by their own history.
--   * (status, created_at) is what the sweeper walks.
--
-- Applied by hand (see the migrations note in the project memory). Pipe in only the up section
-- — the down section drops the tables, so running the whole file undoes itself.
--
-- After applying: `prisma db pull` to bring the models into prisma/schema.prisma. The code
-- uses raw SQL against these tables until then, so nothing waits on it.

-- migrate:up
CREATE TABLE IF NOT EXISTS public.hotel_bookings (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_reference  text        NOT NULL,
    user_id            uuid        NOT NULL,
    status             text        NOT NULL DEFAULT 'PAYMENT_PENDING'
        CONSTRAINT hotel_bookings_status_check CHECK (status IN (
            'DRAFT', 'PREBOOKED', 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING',
            'CONFIRMED', 'CANCEL_REQUESTED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED',
            'REFUND_FAILED', 'FAILED', 'EXPIRED', 'NEEDS_REVIEW'
        )),
    provider           text        NOT NULL,
    prebook_ref        text        NOT NULL,
    payment_intent_id  text,
    hotel_code         text,
    property_name      text,
    room_name          text,
    check_in           date,
    check_out          date,
    -- What was authorised, in the currency's minor unit (zero-decimal aware, via toStripeAmount).
    currency           text        NOT NULL,
    amount_minor       bigint      NOT NULL,
    -- The purchase options the confirmation needs that are not people: board, voucher, special
    -- requests, the policy the guest agreed to. Everything that is a person is in the guests table.
    draft              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    supplier_reference text,
    failure_code       text,
    failure_message    text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_bookings_reference_uniq
    ON public.hotel_bookings (booking_reference);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_bookings_payment_intent_uniq
    ON public.hotel_bookings (payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_bookings_live_prebook_uniq
    ON public.hotel_bookings (user_id, prebook_ref)
    WHERE status IN ('DRAFT', 'PREBOOKED', 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', 'NEEDS_REVIEW');

CREATE INDEX IF NOT EXISTS hotel_bookings_status_created_idx
    ON public.hotel_bookings (status, created_at);

CREATE TABLE IF NOT EXISTS public.hotel_booking_guests (
    id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id  uuid    NOT NULL REFERENCES public.hotel_bookings (id) ON DELETE CASCADE,
    position    integer NOT NULL,
    kind        text    NOT NULL CHECK (kind IN ('holder', 'adult', 'child')),
    first_name  text    NOT NULL,
    last_name   text    NOT NULL,
    age         integer,
    -- Only the holder has one.
    email       text,
    CONSTRAINT hotel_booking_guests_position_uniq UNIQUE (booking_id, position)
);

CREATE TABLE IF NOT EXISTS public.hotel_booking_payments (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id         uuid        NOT NULL REFERENCES public.hotel_bookings (id) ON DELETE CASCADE,
    payment_intent_id  text        NOT NULL,
    amount_minor       bigint      NOT NULL,
    currency           text        NOT NULL,
    status             text        NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'authorized', 'captured', 'voided', 'failed')),
    captured_at        timestamptz,
    voided_at          timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hotel_booking_payments_pi_uniq UNIQUE (payment_intent_id)
);

CREATE TABLE IF NOT EXISTS public.hotel_booking_events (
    id          bigserial   PRIMARY KEY,
    booking_id  uuid        NOT NULL REFERENCES public.hotel_bookings (id) ON DELETE CASCADE,
    -- NULL for the event that created the attempt.
    from_status text,
    to_status   text        NOT NULL,
    actor       text        NOT NULL CHECK (actor IN ('browser', 'webhook', 'sweeper', 'admin')),
    reason      text,
    payload     jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hotel_booking_events_booking_idx
    ON public.hotel_booking_events (booking_id, created_at);

-- migrate:down
DROP TABLE IF EXISTS public.hotel_booking_events;
DROP TABLE IF EXISTS public.hotel_booking_payments;
DROP TABLE IF EXISTS public.hotel_booking_guests;
DROP TABLE IF EXISTS public.hotel_bookings;
