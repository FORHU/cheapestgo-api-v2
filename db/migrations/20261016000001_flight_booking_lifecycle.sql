-- The workflow of a flight booking attempt, beside the sale it may become.
--
-- `booking_sessions` is already the attempt: it holds the passengers, the contact, the fare
-- policy, the price that was charged, the PaymentIntent and the idempotency key. What it lacks is
-- a state that says where the attempt is relative to the money and the airline. Its `status` is a
-- free-form string that several code paths read and write ('pending', 'initiated',
-- 'payment_initiated', 'processing', 'completed', 'failed', 'expired', ...), and none of them can
-- say whether a card has been authorised, whether Duffel has been asked, or what to do about a
-- request that timed out.
--
-- `lifecycle_status` is that state. It carries the machine in
-- src/lib/flights/lifecycle/stateMachine.ts, and it is separate from `status` on purpose: other
-- code still reads `status`, and nothing new may. `flight_booking_events` appends one row for
-- every move, with who made it and why — the answer to "how did this get here".
--
-- Additive only. No existing column changes meaning and nothing is dropped. The code degrades to
-- today's behaviour while these are absent, so deploying before applying is safe, and so is
-- applying before deploying.
--
-- The backfill is the part to read. A new column defaults to PAYMENT_PENDING, which would make
-- every row ever written look like an attempt in flight, and the sweeper voids those. So existing
-- rows are set explicitly from their legacy status, and only rows still NULL are touched — which
-- is what makes re-running this file harmless. Applied by hand, that matters.
--
--   completed, booked  -> CONFIRMED  (the sale exists)
--   failed             -> FAILED
--   everything else    -> EXPIRED    (pending, initiated, payment_initiated, payment_authorized,
--                                     processing, expired). Inert: nothing acts on EXPIRED.
--
-- A session that was genuinely mid-flight at the moment this is applied therefore reads EXPIRED.
-- The old flow ordered with Duffel before charging, so there is no authorisation to release for
-- it; `auto-recover` and `cleanup-orphaned-duffel-orders` keep handling those as they do today.
--
-- Indexes that matter:
--   * payment_intent_id is unique where present. It is the backstop for the claim in the code
--     (`UPDATE ... WHERE lifecycle_status = 'PAYMENT_AUTHORIZED'`): two callers racing to
--     complete one payment cannot both be handed it. CHECK FIRST that no PaymentIntent is shared
--     by two sessions, or this statement fails and nothing after it runs:
--
--       SELECT payment_intent_id, count(*) FROM public.booking_sessions
--        WHERE payment_intent_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--
--   * (lifecycle_status, created_at) is what the sweeper walks.
--
-- The up section is one transaction: it applies whole or not at all (a duplicate PaymentIntent
-- rolls everything back rather than leaving a column with no index), and no row can be written
-- between the backfill and NOT NULL. It locks booking_sessions while it runs — a full-table
-- UPDATE and two index builds — so apply it at a quiet moment.
--
-- Applied by hand (see the migrations note in the project memory). Pipe in only the up section
-- — the down section drops what was added, so running the whole file undoes itself.
--
-- Or with dbmate (`npx dbmate --url "…?sslmode=disable" up`). `transaction:false` below is what
-- makes that work: dbmate otherwise wraps the file in a transaction of its own, the COMMIT here
-- ends it early, and dbmate fails with "pq: unexpected transaction status idle" after the SQL
-- has already committed. With it, this file's own BEGIN … COMMIT is the only transaction.
--
-- After applying: `prisma db pull` to bring the models into prisma/schema.prisma. The code uses
-- raw SQL against these until then, so nothing waits on it.
--
-- `duffel_pre_order_*` are left alone. The new flow stops writing them; the old rows keep theirs.

-- migrate:up transaction:false
BEGIN;

ALTER TABLE public.booking_sessions
    ADD COLUMN IF NOT EXISTS lifecycle_status text;

UPDATE public.booking_sessions
   SET lifecycle_status = CASE
           WHEN status IN ('completed', 'booked') THEN 'CONFIRMED'
           WHEN status = 'failed'                 THEN 'FAILED'
           ELSE                                        'EXPIRED'
       END
 WHERE lifecycle_status IS NULL;

ALTER TABLE public.booking_sessions
    ALTER COLUMN lifecycle_status SET DEFAULT 'PAYMENT_PENDING',
    ALTER COLUMN lifecycle_status SET NOT NULL;

ALTER TABLE public.booking_sessions
    DROP CONSTRAINT IF EXISTS booking_sessions_lifecycle_status_check;
ALTER TABLE public.booking_sessions
    ADD CONSTRAINT booking_sessions_lifecycle_status_check CHECK (lifecycle_status IN (
        'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING',
        'CONFIRMED', 'FAILED', 'EXPIRED', 'NEEDS_REVIEW'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS booking_sessions_payment_intent_uniq
    ON public.booking_sessions (payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS booking_sessions_lifecycle_created_idx
    ON public.booking_sessions (lifecycle_status, created_at);

CREATE TABLE IF NOT EXISTS public.flight_booking_events (
    id          bigserial   PRIMARY KEY,
    session_id  uuid        NOT NULL REFERENCES public.booking_sessions (id) ON DELETE CASCADE,
    -- NULL for the event that created the attempt.
    from_status text,
    to_status   text        NOT NULL,
    actor       text        NOT NULL CHECK (actor IN ('browser', 'webhook', 'sweeper', 'admin')),
    reason      text,
    payload     jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flight_booking_events_session_idx
    ON public.flight_booking_events (session_id, created_at);

COMMIT;

-- migrate:down
DROP TABLE IF EXISTS public.flight_booking_events;
DROP INDEX IF EXISTS public.booking_sessions_lifecycle_created_idx;
DROP INDEX IF EXISTS public.booking_sessions_payment_intent_uniq;
ALTER TABLE public.booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_lifecycle_status_check;
ALTER TABLE public.booking_sessions DROP COLUMN IF EXISTS lifecycle_status;
