-- migrate:up
-- Every call that reaches a supplier's booking API, recorded before it is made.
--
-- On 2026-09-06 a real hotel booking (CG-770AZS, miasageori_station_daewon) was created on
-- the live OTV access code. It appears in TravelgateX's booking list. It appears nowhere in
-- this database: no `bookings` row, no `hotel_prebook_quotes` row, and `api_logs` records
-- only Duffel and Stripe. OTV raised it with us and we could neither confirm nor deny it.
--
-- The path that allows this is /api/fn/travelgatex-book: it performs the supplier mutation
-- and writes nothing. The `bookings` row is written by confirmAndSaveTgxBooking, one level
-- up — so any caller that skips that wrapper books real inventory invisibly. The same is
-- true of the cancel route, which matters because OTV monitors cancellation rates and a
-- cancellation we cannot see is one we cannot explain.
--
-- A `bookings` row therefore records a *sale*. This table records a *supplier call*, which
-- is a different fact and the one that was missing: it is written before the mutation, so a
-- call that dies mid-flight still leaves the attempt behind, and a supplier booking with no
-- row here means something reached OTV from outside this codebase entirely.
--
-- Deliberately not a foreign key to bookings: the rows this exists to catch are precisely
-- the ones with no booking to point at.

CREATE TABLE IF NOT EXISTS supplier_booking_attempts (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider           text        NOT NULL,
    operation          text        NOT NULL,   -- 'book' | 'cancel'
    -- Ours, and supplied by the caller on the direct route — which is how a booking can
    -- carry a reference this system never minted.
    client_reference   text,
    supplier_reference text,
    status             text        NOT NULL,   -- 'attempted' | 'confirmed' | 'failed'
    hotel_code         text,
    hotel_name         text,
    price_gross        numeric,
    currency           text,
    error              text,
    source_brand       text,
    -- Who asked. The question after CG-770AZS was "who made this booking", and nothing in
    -- the system could answer it.
    caller_ip          text,
    caller_agent       text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    completed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS supplier_booking_attempts_created_at_idx
    ON supplier_booking_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS supplier_booking_attempts_client_reference_idx
    ON supplier_booking_attempts (client_reference)
    WHERE client_reference IS NOT NULL;
-- The reconciliation query this exists for: attempts that never reached a terminal state.
CREATE INDEX IF NOT EXISTS supplier_booking_attempts_open_idx
    ON supplier_booking_attempts (created_at DESC)
    WHERE completed_at IS NULL;

-- migrate:down
DROP TABLE IF EXISTS supplier_booking_attempts;
