-- Baseline schema for an EMPTY database. Not a dbmate migration — deliberately.
--
-- db/migrations has no beginning. Its earliest entry is 2026-09-07 and every one of them
-- only *adds* to a schema that was already there, inherited from v1. Nothing in this
-- repository creates users, profiles or bookings, and dbmate runs with --no-dump-schema,
-- so there is no structure dump either. A developer with an empty Postgres therefore could
-- not get a working database from this repository at all: the app starts, and the first
-- thing that fails is sign-up, because `users` does not exist.
--
-- Outside db/migrations on purpose. As a migration, dbmate would try to apply it to dev and
-- production, where every table already exists and three of the fourteen migrations do not
-- use IF NOT EXISTS.
--
-- HOW IT IS BUILT. Tables come from `prisma migrate diff --from-empty`, which reads
-- prisma/schema.prisma — kept current by introspection (`npm run db:pull`). Prisma does not
-- model functions or triggers, so those are dumped from a live database with
-- pg_get_functiondef / pg_get_triggerdef rather than written by hand. Functions come first:
-- `chat_conversations.reference` defaults to mint_chat_reference(), so the table cannot be
-- created until that function exists.
--
-- Regenerate with db/baseline.README.md.

-- ═══ Functions (12) ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_booking_with_policy(p_booking jsonb, p_snapshot jsonb, p_tiers jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_booking_id TEXT;
  v_snapshot_id UUID;
  v_tier JSONB;
  v_tier_order INT := 0;
BEGIN
  v_booking_id := p_booking->>'booking_id';
  INSERT INTO bookings (
    booking_id, user_id, property_name, property_image, room_name,
    check_in, check_out, guests_adults, guests_children, total_price, currency,
    holder_first_name, holder_last_name, holder_email, status, special_requests,
    voucher_code, discount_amount, policy_type, cancellation_policy
  ) VALUES (
    v_booking_id, (p_booking->>'user_id')::UUID, p_booking->>'property_name',
    p_booking->>'property_image', p_booking->>'room_name',
    (p_booking->>'check_in')::DATE, (p_booking->>'check_out')::DATE,
    COALESCE((p_booking->>'guests_adults')::INTEGER, 1),
    COALESCE((p_booking->>'guests_children')::INTEGER, 0),
    (p_booking->>'total_price')::DECIMAL, COALESCE(p_booking->>'currency', 'PHP'),
    p_booking->>'holder_first_name', p_booking->>'holder_last_name', p_booking->>'holder_email',
    COALESCE(p_booking->>'status', 'confirmed'), p_booking->>'special_requests',
    p_booking->>'voucher_code', COALESCE((p_booking->>'discount_amount')::DECIMAL, 0),
    COALESCE(p_booking->>'policy_type', 'non_refundable'),
    p_snapshot->'raw_liteapi_response'
  );
  INSERT INTO booking_policy_snapshots (
    booking_id, policy_type, summary, refundable_tag, hotel_remarks,
    no_show_penalty, early_departure_fee, free_cancel_deadline, raw_liteapi_response, captured_at
  ) VALUES (
    v_booking_id, (p_snapshot->>'policy_type')::booking_policy_type,
    p_snapshot->>'summary', p_snapshot->>'refundable_tag',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'hotel_remarks')), '{}'::TEXT[]),
    COALESCE((p_snapshot->>'no_show_penalty')::DECIMAL, 0),
    COALESCE((p_snapshot->>'early_departure_fee')::DECIMAL, 0),
    CASE WHEN p_snapshot->>'free_cancel_deadline' IS NOT NULL THEN (p_snapshot->>'free_cancel_deadline')::TIMESTAMPTZ ELSE NULL END,
    COALESCE(p_snapshot->'raw_liteapi_response', '{}'::JSONB), NOW()
  ) RETURNING id INTO v_snapshot_id;
  UPDATE bookings SET policy_snapshot_id = v_snapshot_id WHERE booking_id = v_booking_id;
  FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers) LOOP
    INSERT INTO policy_tiers (snapshot_id, cancel_deadline, penalty_amount, penalty_type, currency, tier_order)
    VALUES (v_snapshot_id, (v_tier->>'cancel_deadline')::TIMESTAMPTZ, (v_tier->>'penalty_amount')::DECIMAL,
            COALESCE(v_tier->>'penalty_type', 'fixed'), COALESCE(v_tier->>'currency', 'PHP'), v_tier_order);
    v_tier_order := v_tier_order + 1;
  END LOOP;
  RETURN jsonb_build_object('booking_id', v_booking_id, 'snapshot_id', v_snapshot_id, 'tier_count', v_tier_order);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_revenue_stats(php_rate numeric DEFAULT NULL::numeric, p_brand text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE result JSON;
BEGIN
    WITH combined AS (
        SELECT total_price, COALESCE(markup_amount, 0) AS markup_amount,
               COALESCE(currency, 'PHP') AS currency, created_at,
               usd_amount, fx_rate, fx_source
        FROM unified_bookings
        WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
        UNION ALL
        SELECT total_price, 0, COALESCE(currency,'USD'), created_at,
               usd_amount, fx_rate, fx_source
        FROM bookings
        WHERE status IN ('confirmed','ticketed','awaiting_ticket')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
        UNION ALL
        SELECT COALESCE(charged_price, total_price),
               COALESCE(charged_price, total_price) - COALESCE(supplier_cost, total_price),
               COALESCE(currency,'USD'), created_at,
               usd_amount, fx_rate, fx_source
        FROM flight_bookings
        WHERE status IN ('booked','ticketed','awaiting_ticket')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
    )
    SELECT json_build_object(
        -- Money handled, in USD. Only rows carrying a locked rate contribute.
        'grossBookingValue', COALESCE(SUM(usd_amount), 0),
        -- What we keep: the markup, restated at the same locked rate.
        'netRevenue',        COALESCE(SUM(markup_amount * fx_rate), 0),
        'confirmedCount',    COUNT(*),
        'unconvertedCount',  COUNT(*) FILTER (WHERE usd_amount IS NULL),
        'estimatedCount',    COUNT(*) FILTER (WHERE fx_source = 'estimated'),
        'dailyRevenue',      COALESCE(SUM(usd_amount) FILTER (WHERE created_at::date = CURRENT_DATE), 0),
        'monthlyRevenue',    COALESCE(SUM(usd_amount) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())), 0),
        -- Unconverted, in each booking's own currency. Always correct; never blended.
        'revenueByCurrency', (
            SELECT COALESCE(json_object_agg(currency, total), '{}'::json)
            FROM (SELECT currency, SUM(total_price) AS total FROM combined GROUP BY currency) g
        ),
        -- Back-compat aliases so existing callers keep rendering during rollout.
        'totalRevenue',      COALESCE(SUM(usd_amount), 0),
        'totalMarkup',       COALESCE(SUM(markup_amount * fx_rate), 0),
        'reportingCurrency', 'USD'
    ) INTO result
    FROM combined;
    RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_rate_limit(p_key text, p_window_ms bigint)
 RETURNS TABLE(current_count integer, reset_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_now      TIMESTAMPTZ := NOW();
    v_reset_at TIMESTAMPTZ := v_now + (p_window_ms || ' milliseconds')::INTERVAL;
BEGIN
    RETURN QUERY
    INSERT INTO rate_limit_counters (key, count, reset_at)
    VALUES (p_key, 1, v_reset_at)
    ON CONFLICT (key) DO UPDATE SET
        count    = CASE WHEN rate_limit_counters.reset_at < v_now THEN 1 ELSE rate_limit_counters.count + 1 END,
        reset_at = CASE WHEN rate_limit_counters.reset_at < v_now THEN v_reset_at ELSE rate_limit_counters.reset_at END
    RETURNING rate_limit_counters.count::INT, rate_limit_counters.reset_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_search_stats(p_origin text, p_destination text, p_min_price numeric, p_avg_price numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.flight_search_stats (origin, destination, min_price, avg_price, search_count, last_searched_at)
    VALUES (p_origin, p_destination, p_min_price, p_avg_price, 1, NOW())
    ON CONFLICT (origin, destination) DO UPDATE SET
        search_count     = public.flight_search_stats.search_count + 1,
        min_price        = LEAST(public.flight_search_stats.min_price, EXCLUDED.min_price),
        avg_price        = (public.flight_search_stats.avg_price + EXCLUDED.avg_price) / 2,
        last_searched_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mint_chat_reference()
 RETURNS text
 LANGUAGE sql
AS $function$
    SELECT 'CS-' || string_agg(
        substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 32)::int, 1), ''
    )
    FROM generate_series(1, 6);
$function$
;

CREATE OR REPLACE FUNCTION public.save_booking_transaction(p_booking jsonb, p_snapshot jsonb, p_tiers jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_booking_id   UUID;
  v_snapshot_id  UUID;
BEGIN
  INSERT INTO bookings (
    booking_id, user_id, hotel_id, property_name, property_image, room_name,
    check_in, check_out, guests_adults, guests_children, total_price, currency,
    holder_first_name, holder_last_name, holder_email, special_requests,
    voucher_code, discount_amount, status, cancellation_policy
  ) VALUES (
    COALESCE((p_booking->>'booking_id')::UUID, gen_random_uuid()),
    (p_booking->>'user_id')::UUID, p_booking->>'hotel_id',
    p_booking->>'property_name', p_booking->>'property_image', p_booking->>'room_name',
    (p_booking->>'check_in')::DATE, (p_booking->>'check_out')::DATE,
    COALESCE((p_booking->>'guests_adults')::INTEGER, 1),
    COALESCE((p_booking->>'guests_children')::INTEGER, 0),
    (p_booking->>'total_price')::DECIMAL, p_booking->>'currency',
    p_booking->>'holder_first_name', p_booking->>'holder_last_name', p_booking->>'holder_email',
    p_booking->>'special_requests', p_booking->>'voucher_code',
    COALESCE((p_booking->>'discount_amount')::DECIMAL, 0),
    COALESCE(p_booking->>'status', 'confirmed'),
    p_snapshot->'raw_provider_response'
  ) RETURNING booking_id INTO v_booking_id;
  INSERT INTO booking_policy_snapshots (
    booking_id, policy_type, summary, refundable_tag, hotel_remarks,
    no_show_penalty, early_departure_fee, free_cancel_deadline, raw_provider_response, captured_at
  ) VALUES (
    v_booking_id, (p_snapshot->>'policy_type')::booking_policy_type,
    p_snapshot->>'summary', p_snapshot->>'refundable_tag',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'hotel_remarks')), '{}'::TEXT[]),
    COALESCE((p_snapshot->>'no_show_penalty')::DECIMAL, 0),
    COALESCE((p_snapshot->>'early_departure_fee')::DECIMAL, 0),
    CASE WHEN p_snapshot->>'free_cancel_deadline' IS NOT NULL THEN (p_snapshot->>'free_cancel_deadline')::TIMESTAMPTZ ELSE NULL END,
    COALESCE(p_snapshot->'raw_provider_response', '{}'::JSONB), NOW()
  ) RETURNING id INTO v_snapshot_id;
  UPDATE bookings SET policy_snapshot_id = v_snapshot_id WHERE booking_id = v_booking_id;
  IF jsonb_array_length(p_tiers) > 0 THEN
    INSERT INTO policy_tiers (snapshot_id, cancel_deadline, penalty_amount, penalty_type, currency, tier_order)
    SELECT v_snapshot_id, (tier->>'cancel_deadline')::TIMESTAMPTZ, (tier->>'penalty_amount')::DECIMAL,
           tier->>'penalty_type', tier->>'currency', (tier->>'tier_order')::INTEGER
    FROM jsonb_array_elements(p_tiers) AS tier;
  END IF;
  RETURN jsonb_build_object('booking_id', v_booking_id, 'snapshot_id', v_snapshot_id);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_admin_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.update_booking_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.update_notifications_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.update_support_conversations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.update_unified_bookings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$
;

-- ═══ Schema ═════════════════════════════════════════════════════════════════

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "booking_policy_type" AS ENUM ('free_cancellation', 'non_refundable', 'partial_refund', 'tiered');

-- CreateEnum
CREATE TYPE "passenger_type" AS ENUM ('ADT', 'CHD', 'INF');

-- CreateEnum
CREATE TYPE "push_platform" AS ENUM ('ios', 'android', 'web');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('pending', 'approved', 'processed', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "trip_type" AS ENUM ('flight', 'hotel');

-- CreateEnum
CREATE TYPE "voucher_discount_type" AS ENUM ('percent', 'fixed');

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action" TEXT NOT NULL,
    "admin_id" UUID,
    "admin_email" TEXT,
    "target_id" TEXT,
    "details" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '""',
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT DEFAULT 'POST',
    "request_params" JSONB,
    "response_status" INTEGER,
    "response_summary" JSONB,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "user_id" UUID,
    "search_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "guest_name" TEXT,
    "hotel_name" TEXT,
    "room_name" TEXT,
    "check_in" TEXT,
    "check_out" TEXT,
    "total_price" DECIMAL,
    "currency" TEXT DEFAULT 'PHP',
    "email_html" TEXT,
    "sent_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT DEFAULT 'queued',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_financial_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "transaction_id" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_financial_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_policy_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" TEXT NOT NULL,
    "policy_type" "booking_policy_type" NOT NULL DEFAULT 'non_refundable',
    "summary" TEXT,
    "refundable_tag" TEXT,
    "hotel_remarks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "no_show_penalty" DECIMAL(10,2) DEFAULT 0,
    "early_departure_fee" DECIMAL(10,2) DEFAULT 0,
    "free_cancel_deadline" TIMESTAMPTZ(6),
    "raw_provider_response" JSONB NOT NULL DEFAULT '{}',
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "api_version" TEXT,
    "raw_liteapi_response" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "booking_policy_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "flight" JSONB NOT NULL DEFAULT '{}',
    "passengers" JSONB NOT NULL DEFAULT '[]',
    "contact" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT,
    "payment_intent_id" TEXT,
    "capture_method" TEXT DEFAULT 'automatic',
    "is_refundable" BOOLEAN,
    "is_changeable" BOOLEAN,
    "refund_penalty_amount" DECIMAL(10,2),
    "refund_penalty_currency" TEXT,
    "change_penalty_amount" DECIMAL(10,2),
    "change_penalty_currency" TEXT,
    "policy_source" TEXT,
    "policy_version" TEXT,
    "policy_locked" BOOLEAN NOT NULL DEFAULT false,
    "fare_policy" JSONB,
    "seat_service_ids" TEXT[],
    "seat_total" DECIMAL DEFAULT 0,
    "duffel_pre_order_id" TEXT,
    "duffel_pre_order_pnr" TEXT,
    "duffel_pre_order_tickets" TEXT[],
    "duffel_pre_order_ticketed" BOOLEAN,
    "original_price" DECIMAL,
    "charged_price" DECIMAL,
    "markup_pct" DECIMAL,
    "currency" TEXT,
    "bag_service_ids" TEXT[],
    "bag_total" DECIMAL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(6),
    "booking_reference" TEXT,
    "payment_currency" TEXT,
    "lifecycle_status" TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',

    CONSTRAINT "booking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "property_name" TEXT NOT NULL,
    "property_image" TEXT,
    "room_name" TEXT NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guests_adults" INTEGER DEFAULT 1,
    "guests_children" INTEGER DEFAULT 0,
    "total_price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT DEFAULT 'PHP',
    "holder_first_name" TEXT NOT NULL,
    "holder_last_name" TEXT NOT NULL,
    "holder_email" TEXT NOT NULL,
    "status" TEXT DEFAULT 'confirmed',
    "special_requests" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "cancellation_policy" JSONB,
    "voucher_code" TEXT,
    "discount_amount" DECIMAL(10,2) DEFAULT 0,
    "policy_type" TEXT DEFAULT 'non_refundable',
    "policy_snapshot_id" UUID,
    "bundled_with_flight_id" TEXT,
    "payment_intent_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'liteapi',
    "provider_metadata" JSONB,
    "supplier_cost" DECIMAL(12,2),
    "charged_price" DECIMAL(12,2),
    "markup_pct" DECIMAL(6,4),
    "hotel_id" TEXT,
    "booking_reference" TEXT,
    "fx_captured_at" TIMESTAMPTZ(6),
    "fx_rate" DECIMAL(20,10),
    "fx_source" TEXT,
    "source_brand" TEXT,
    "usd_amount" DECIMAL(14,4),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dest_code_cache" (
    "city_key" TEXT NOT NULL,
    "dest_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hotel_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dest_code_cache_pkey" PRIMARY KEY ("city_key")
);

-- CreateTable
CREATE TABLE "device_push_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "expo_push_token" TEXT NOT NULL,
    "platform" "push_platform" DEFAULT 'ios',
    "app_version" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error_message" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etg_hotel_index" (
    "hid" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "lat" DOUBLE PRECISION DEFAULT 0,
    "lng" DOUBLE PRECISION DEFAULT 0,
    "country_code" CHAR(2) NOT NULL,
    "region_id" BIGINT,
    "star_rating" SMALLINT DEFAULT 0,
    "indexed_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etg_hotel_index_pkey" PRIMARY KEY ("hid")
);

-- CreateTable
CREATE TABLE "etg_index_status" (
    "country_code" CHAR(2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "hotel_count" INTEGER DEFAULT 0,
    "last_seeded_at" TIMESTAMPTZ(6),
    "last_error" TEXT,

    CONSTRAINT "etg_index_status_pkey" PRIMARY KEY ("country_code")
);

-- CreateTable
CREATE TABLE "flight_booking_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "flight_booking_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "pnr" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT DEFAULT 'USD',
    "provider_order_id" TEXT,
    "session_id" UUID,
    "trip_type" TEXT,
    "payment_intent_id" TEXT,
    "ticket_time_limit" TIMESTAMPTZ(6),
    "cancellation_requested_at" TIMESTAMPTZ(6),
    "cancellation_completed_at" TIMESTAMPTZ(6),
    "refund_amount" DECIMAL(12,2),
    "refund_penalty_amount" DECIMAL(12,2),
    "refund_currency" TEXT,
    "cancellation_log" JSONB NOT NULL DEFAULT '[]',
    "fare_policy" JSONB,
    "policy_snapshot_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "supplier_cancellation_id" TEXT,
    "payment_currency" TEXT,
    "supplier_currency" TEXT,
    "fx_rate_snapshot" DECIMAL,
    "supplier_cost" DECIMAL(12,2),
    "charged_price" DECIMAL(12,2),
    "markup_pct" DECIMAL(6,4),
    "bundled_with_hotel_id" TEXT,
    "duffel_order_id" TEXT,
    "confirmed_price" DECIMAL(12,2),
    "confirmed_currency" TEXT,
    "ticket_numbers" JSONB DEFAULT '[]',
    "ticketed_at" TIMESTAMPTZ(6),
    "booking_reference" TEXT,
    "fx_captured_at" TIMESTAMPTZ(6),
    "fx_rate" DECIMAL(20,10),
    "fx_source" TEXT,
    "source_brand" TEXT,
    "usd_amount" DECIMAL(14,4),

    CONSTRAINT "flight_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT DEFAULT 'USD',
    "airline" TEXT,
    "image_url" TEXT,
    "departure_date" DATE,
    "return_date" DATE,
    "discount_tag" TEXT,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "baseline_price" DECIMAL(10,2),
    "last_refreshed_at" TIMESTAMPTZ(6),
    "original_price" DECIMAL(10,2),
    "ends_in" TEXT,
    "cabin_class" TEXT NOT NULL DEFAULT 'economy',

    CONSTRAINT "flight_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_results_cache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "search_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "airline" TEXT NOT NULL,
    "departure_time" TIMESTAMPTZ(6) NOT NULL,
    "arrival_time" TIMESTAMPTZ(6) NOT NULL,
    "duration" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stops" INTEGER NOT NULL DEFAULT 0,
    "remaining_seats" INTEGER,
    "refundable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "flight_results_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_search_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "min_price" DECIMAL(12,2),
    "avg_price" DECIMAL(12,2),
    "search_count" INTEGER DEFAULT 1,
    "last_searched_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flight_search_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_searches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departure_date" DATE NOT NULL,
    "return_date" DATE,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "cabin_class" TEXT NOT NULL DEFAULT 'economy',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flight_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "airline" TEXT NOT NULL,
    "flight_number" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departure" TIMESTAMPTZ(6) NOT NULL,
    "arrival" TIMESTAMPTZ(6) NOT NULL,
    "itinerary_index" INTEGER NOT NULL DEFAULT 0,
    "cabin_class" TEXT NOT NULL DEFAULT 'economy',
    "segment_index" INTEGER NOT NULL DEFAULT 0,
    "destination_terminal" TEXT,
    "origin_terminal" TEXT,

    CONSTRAINT "flight_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "golf_courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "holes" INTEGER NOT NULL,
    "par" INTEGER,
    "green_fee_from" DECIMAL(10,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timezone" TEXT,
    "booking_window_days" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "golf_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "golf_tee_time_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "days_of_week" SMALLINT[],
    "first_tee" TIME(6) NOT NULL,
    "last_tee" TIME(6) NOT NULL,
    "interval_minutes" INTEGER NOT NULL,
    "spots" INTEGER NOT NULL DEFAULT 4,
    "price_per_player" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "golf_tee_time_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "golf_tee_times" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "schedule_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "spots" INTEGER NOT NULL,
    "spots_left" INTEGER NOT NULL,
    "price_per_player" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "golf_tee_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_content" (
    "hotel_id" TEXT NOT NULL,
    "name" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "star_rating" SMALLINT NOT NULL DEFAULT 0,
    "lat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lng" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "description" TEXT,
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "ratehawk_hid" TEXT,
    "content_source" TEXT,
    "last_attempt_at" TIMESTAMPTZ(6),
    "check_in_time" TEXT,
    "check_out_time" TEXT,
    "review_rating" DECIMAL(4,2),
    "review_count" INTEGER,
    "amenity_groups" JSONB NOT NULL DEFAULT '[]',
    "important_information" TEXT,
    "room_groups" JSONB DEFAULT '[]',
    "google_place_id" TEXT,
    "google_enriched_at" TIMESTAMPTZ(6),
    "etg_content_seeded_at" TIMESTAMPTZ(6),
    "metapolicy_extra_info" TEXT,
    "metapolicy_struct" JSONB,
    "chain_code" TEXT,
    "contact_info" JSONB,
    "delisted_at" TIMESTAMPTZ(6),
    "giata_id" TEXT,
    "osm_geocoded_at" TIMESTAMPTZ(6),
    "room_groups_seeded_at" TIMESTAMPTZ(6),
    "serp_filters" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "hotel_content_pkey" PRIMARY KEY ("hotel_id")
);

-- CreateTable
CREATE TABLE "hotel_deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "country_code" TEXT DEFAULT '',
    "rating" DECIMAL(3,1) DEFAULT 0,
    "stars" INTEGER DEFAULT 0,
    "image_url" TEXT DEFAULT '',
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "original_price" DECIMAL(10,2) DEFAULT 0,
    "currency" TEXT DEFAULT 'PHP',
    "discount_tag" TEXT DEFAULT '',
    "discount_pct" INTEGER DEFAULT 0,
    "check_in" DATE,
    "check_out" DATE,
    "badge" TEXT,
    "hotel_code" TEXT DEFAULT '',
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "city_key" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "board_code" TEXT,
    "refundable" BOOLEAN,
    "baseline_price" DECIMAL(10,2),
    "last_refreshed_at" TIMESTAMPTZ(6),

    CONSTRAINT "hotel_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_review_items" (
    "id" BIGSERIAL NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "reviewer_name" TEXT,
    "review_date" TEXT,
    "score" DECIMAL(4,2),
    "pros" TEXT,
    "cons" TEXT,
    "traveler_type" TEXT,
    "language" TEXT,
    "headline" TEXT,
    "country" TEXT,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_reviews" (
    "hotel_id" TEXT NOT NULL,
    "rating" DECIMAL(4,2),
    "reviews_count" INTEGER NOT NULL DEFAULT 0,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_reviews_pkey" PRIMARY KEY ("hotel_id")
);

-- CreateTable
CREATE TABLE "hotel_search_cache" (
    "cache_key" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hotel_search_cache_pkey" PRIMARY KEY ("cache_key")
);

-- CreateTable
CREATE TABLE "hotel_search_stats" (
    "city_key" TEXT NOT NULL,
    "country_code" TEXT NOT NULL DEFAULT '',
    "search_count" INTEGER NOT NULL DEFAULT 1,
    "last_searched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_search_stats_pkey" PRIMARY KEY ("city_key")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onda_properties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "star_rating" INTEGER,
    "thumbnail_url" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "status" TEXT,
    "last_synced_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onda_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passengers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "type" "passenger_type" NOT NULL,
    "passport" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticket_number" TEXT,
    "seat_number" TEXT,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "place_cache" (
    "place_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "cached_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_cache_pkey" PRIMARY KEY ("place_id")
);

-- CreateTable
CREATE TABLE "policy_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshot_id" UUID NOT NULL,
    "cancel_deadline" TIMESTAMPTZ(6) NOT NULL,
    "penalty_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "penalty_type" TEXT NOT NULL DEFAULT 'fixed',
    "currency" TEXT DEFAULT 'PHP',
    "tier_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "policy_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "popular_destinations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "image_url" TEXT,
    "average_price" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "popular_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "cabin_class" TEXT NOT NULL DEFAULT 'economy',
    "adults" INTEGER NOT NULL DEFAULT 1,
    "current_price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "target_price" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "full_name" TEXT,
    "phone" TEXT,
    "avatar_url" TEXT,
    "nationality" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT DEFAULT 'user',
    "banned_at" TIMESTAMPTZ(6),
    "preferences" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "refund_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" TEXT NOT NULL,
    "policy_snapshot_id" UUID,
    "user_id" UUID NOT NULL,
    "refund_type" TEXT NOT NULL,
    "requested_amount" DECIMAL(10,2) NOT NULL,
    "approved_amount" DECIMAL(10,2),
    "currency" TEXT DEFAULT 'PHP',
    "penalty_amount" DECIMAL(10,2) DEFAULT 0,
    "applied_tier_id" UUID,
    "status" "refund_status" NOT NULL DEFAULT 'pending',
    "status_reason" TEXT,
    "external_ref" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "processed_by" TEXT,

    CONSTRAINT "refund_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_trips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "trip_type" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "image_url" TEXT,
    "deep_link" TEXT NOT NULL,
    "snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_migrations" (
    "version" VARCHAR NOT NULL,

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "search_results_cache" (
    "cache_key" TEXT NOT NULL,
    "city_name" TEXT NOT NULL,
    "region_id" INTEGER NOT NULL DEFAULT 0,
    "checkin" DATE NOT NULL,
    "checkout" DATE NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 2,
    "children" INTEGER NOT NULL DEFAULT 0,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "nationality" TEXT NOT NULL DEFAULT 'KR',
    "hotels" JSONB NOT NULL DEFAULT '[]',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "cached_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "search_results_cache_pkey" PRIMARY KEY ("cache_key")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_processed_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" TEXT NOT NULL,
    "event_type" TEXT,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "payment_intent_id" TEXT,
    "booking_reference" TEXT,
    "error_message" TEXT,
    "delivery_count" INTEGER NOT NULL DEFAULT 1,
    "last_received_at" TIMESTAMPTZ(6),

    CONSTRAINT "stripe_processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tgx_destination_cache" (
    "city_key" TEXT NOT NULL,
    "destination_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "dest_type" TEXT DEFAULT 'CITY',
    "parent_code" TEXT,

    CONSTRAINT "tgx_destination_cache_pkey" PRIMARY KEY ("city_key")
);

-- CreateTable
CREATE TABLE "travel_styles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unified_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "trip_type" NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_cost" DECIMAL(12,2) DEFAULT 0,
    "markup_amount" DECIMAL(12,2) DEFAULT 0,
    "profit" DECIMAL(12,2) DEFAULT 0,
    "booking_reference" TEXT,
    "fx_captured_at" TIMESTAMPTZ(6),
    "fx_rate" DECIMAL(20,10),
    "fx_source" TEXT,
    "source_brand" TEXT,
    "usd_amount" DECIMAL(14,4),

    CONSTRAINT "unified_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unique_stays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "rating" DECIMAL(2,1),
    "price" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "badge" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unique_stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "first_name" TEXT,
    "last_name" TEXT,
    "avatar_url" TEXT,
    "banned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "birth_date" DATE,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_usage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "voucher_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "booking_id" TEXT,
    "original_price" DECIMAL(10,2) NOT NULL,
    "discount_applied" DECIMAL(10,2) NOT NULL,
    "final_price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT DEFAULT 'PHP',
    "used_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "discount_type" "voucher_discount_type" NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "min_booking_amount" DECIMAL(10,2),
    "max_discount_amount" DECIMAL(10,2),
    "category" TEXT NOT NULL DEFAULT 'general',
    "hotel_ids" TEXT[],
    "location_codes" TEXT[],
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "usage_limit" INTEGER,
    "times_used" INTEGER DEFAULT 0,
    "active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekend_flight_deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "rating" DECIMAL(2,1),
    "reviews" INTEGER DEFAULT 0,
    "original_price" DECIMAL(10,2),
    "sale_price" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "badge" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekend_flight_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_prebook_quotes" (
    "prebook_id" TEXT NOT NULL,
    "net" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "gross" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "room_name" TEXT,
    "check_in" DATE,
    "check_out" DATE,
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (now() + '00:30:00'::interval),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_prebook_quotes_pkey" PRIMARY KEY ("prebook_id")
);

-- CreateTable
CREATE TABLE "tgx_failed_dest_codes" (
    "dest_code" TEXT NOT NULL,
    "city_key" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tgx_failed_dest_codes_pkey" PRIMARY KEY ("dest_code")
);

-- CreateTable
CREATE TABLE "supplier_booking_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "client_reference" TEXT,
    "supplier_reference" TEXT,
    "status" TEXT NOT NULL,
    "hotel_code" TEXT,
    "hotel_name" TEXT,
    "price_gross" DECIMAL,
    "currency" TEXT,
    "error" TEXT,
    "source_brand" TEXT,
    "caller_ip" TEXT,
    "caller_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "supplier_booking_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otv_portfolio_seen" (
    "hotel_id" TEXT NOT NULL,

    CONSTRAINT "otv_portfolio_seen_pkey" PRIMARY KEY ("hotel_id")
);

-- CreateTable
CREATE TABLE "support_assignment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "from_admin_id" UUID,
    "to_admin_id" UUID,
    "actor_admin_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_assignment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_conversation_bookings" (
    "conversation_id" UUID NOT NULL,
    "booking_reference" TEXT NOT NULL,
    "linked_by" UUID,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_conversation_bookings_pkey" PRIMARY KEY ("conversation_id","booking_reference")
);

-- CreateTable
CREATE TABLE "support_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "guest_name" TEXT,
    "guest_email" TEXT,
    "guest_token_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting_human',
    "source_brand" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "assigned_admin_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ai_turn_started_at" TIMESTAMPTZ(6),
    "escalation_reason" TEXT,
    "waiting_notified_at" TIMESTAMPTZ(6),
    "reference" TEXT NOT NULL DEFAULT mint_chat_reference(),
    "priority" TEXT,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_message_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "message_id" UUID,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "uploaded_by_type" TEXT NOT NULL,
    "uploaded_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bytes_deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "support_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_type" TEXT NOT NULL,
    "sender_admin_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notice_code" TEXT,
    "translated_body" TEXT,
    "translated_lang" TEXT,
    "translation_status" TEXT,
    "back_translated_body" TEXT,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "author_admin_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_suggestion_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID,
    "article_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_suggestion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_booking_events" (
    "id" BIGSERIAL NOT NULL,
    "session_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flight_booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_booking_events" (
    "id" BIGSERIAL NOT NULL,
    "booking_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_booking_guests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "age" INTEGER,
    "email" TEXT,

    CONSTRAINT "hotel_booking_guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_booking_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "payment_intent_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "captured_at" TIMESTAMPTZ(6),
    "voided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_booking_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_reference" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
    "provider" TEXT NOT NULL,
    "prebook_ref" TEXT NOT NULL,
    "payment_intent_id" TEXT,
    "hotel_code" TEXT,
    "property_name" TEXT,
    "room_name" TEXT,
    "check_in" DATE,
    "check_out" DATE,
    "currency" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "supplier_reference" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "idx_api_logs_created_at" ON "api_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_api_logs_provider" ON "api_logs"("provider");

-- CreateIndex
CREATE INDEX "idx_booking_emails_booking_id" ON "booking_emails"("booking_id");

-- CreateIndex
CREATE INDEX "idx_booking_emails_status" ON "booking_emails"("status");

-- CreateIndex
CREATE INDEX "idx_booking_financial_events_booking_id" ON "booking_financial_events"("booking_id");

-- CreateIndex
CREATE INDEX "idx_booking_financial_events_transaction_id" ON "booking_financial_events"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_policy_per_booking" ON "booking_policy_snapshots"("booking_id");

-- CreateIndex
CREATE INDEX "idx_policy_snapshot_booking" ON "booking_policy_snapshots"("booking_id");

-- CreateIndex
CREATE INDEX "idx_booking_sessions_expires_at" ON "booking_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_booking_sessions_idempotency" ON "booking_sessions"("idempotency_key", "user_id");

-- CreateIndex
CREATE INDEX "idx_booking_sessions_status" ON "booking_sessions"("status");

-- CreateIndex
CREATE INDEX "idx_booking_sessions_user_id" ON "booking_sessions"("user_id");

-- CreateIndex
CREATE INDEX "booking_sessions_lifecycle_created_idx" ON "booking_sessions"("lifecycle_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_id_key" ON "bookings"("booking_id");

-- CreateIndex
CREATE INDEX "idx_bookings_status" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "idx_bookings_user_id" ON "bookings"("user_id");

-- CreateIndex
CREATE INDEX "dest_code_cache_expires_at_idx" ON "dest_code_cache"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_push_tokens_token_idx" ON "device_push_tokens"("expo_push_token");

-- CreateIndex
CREATE INDEX "device_push_tokens_user_idx" ON "device_push_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_email_logs_booking_id" ON "email_logs"("booking_id");

-- CreateIndex
CREATE INDEX "idx_email_logs_created_at" ON "email_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_email_logs_status" ON "email_logs"("status");

-- CreateIndex
CREATE INDEX "etg_hotel_index_country_name" ON "etg_hotel_index"("country_code", "name_normalized");

-- CreateIndex
CREATE INDEX "etg_hotel_index_name_trgm" ON "etg_hotel_index" USING GIN ("name_normalized" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_flight_booking_notes_booking_id" ON "flight_booking_notes"("booking_id");

-- CreateIndex
CREATE INDEX "idx_flight_bookings_pnr" ON "flight_bookings"("pnr");

-- CreateIndex
CREATE INDEX "idx_flight_bookings_status" ON "flight_bookings"("status");

-- CreateIndex
CREATE INDEX "idx_flight_bookings_user_id" ON "flight_bookings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "flight_deals_origin_destination_cabin_class_key" ON "flight_deals"("origin", "destination", "cabin_class");

-- CreateIndex
CREATE INDEX "idx_flight_results_airline" ON "flight_results_cache"("airline");

-- CreateIndex
CREATE INDEX "idx_flight_results_price" ON "flight_results_cache"("price");

-- CreateIndex
CREATE INDEX "idx_flight_results_search_id" ON "flight_results_cache"("search_id");

-- CreateIndex
CREATE INDEX "idx_flight_search_stats_popularity" ON "flight_search_stats"("search_count" DESC);

-- CreateIndex
CREATE INDEX "idx_flight_search_stats_route" ON "flight_search_stats"("origin", "destination");

-- CreateIndex
CREATE UNIQUE INDEX "flight_search_stats_origin_destination_key" ON "flight_search_stats"("origin", "destination");

-- CreateIndex
CREATE INDEX "idx_flight_searches_date" ON "flight_searches"("departure_date");

-- CreateIndex
CREATE INDEX "idx_flight_searches_route" ON "flight_searches"("origin", "destination");

-- CreateIndex
CREATE INDEX "idx_flight_searches_user_id" ON "flight_searches"("user_id");

-- CreateIndex
CREATE INDEX "idx_flight_segments_booking_id" ON "flight_segments"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "golf_courses_slug_key" ON "golf_courses"("slug");

-- CreateIndex
CREATE INDEX "idx_golf_courses_status_country" ON "golf_courses"("status", "country");

-- CreateIndex
CREATE INDEX "idx_golf_schedules_course" ON "golf_tee_time_schedules"("course_id");

-- CreateIndex
CREATE INDEX "idx_golf_tee_times_schedule" ON "golf_tee_times"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "golf_tee_times_course_start_key" ON "golf_tee_times"("course_id", "starts_at");

-- CreateIndex
CREATE INDEX "hotel_content_fetched_at_idx" ON "hotel_content"("fetched_at");

-- CreateIndex
CREATE INDEX "hotel_content_serp_filters_gin" ON "hotel_content" USING GIN ("serp_filters");

-- CreateIndex
CREATE INDEX "hotel_content_latlng_idx" ON "hotel_content"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_deals_hotel_code_key" ON "hotel_deals"("hotel_code");

-- CreateIndex
CREATE INDEX "hotel_review_items_hotel_id_idx" ON "hotel_review_items"("hotel_id");

-- CreateIndex
CREATE INDEX "hotel_review_items_score_idx" ON "hotel_review_items"("hotel_id", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "hotel_review_items_hotel_id_source_id_key" ON "hotel_review_items"("hotel_id", "source_id");

-- CreateIndex
CREATE INDEX "hotel_reviews_synced_at_idx" ON "hotel_reviews"("synced_at");

-- CreateIndex
CREATE INDEX "idx_hotel_search_cache_expires" ON "hotel_search_cache"("expires_at");

-- CreateIndex
CREATE INDEX "idx_hotel_search_stats_count" ON "hotel_search_stats"("search_count" DESC, "last_searched_at" DESC);

-- CreateIndex
CREATE INDEX "idx_passengers_booking_id" ON "passengers"("booking_id");

-- CreateIndex
CREATE INDEX "idx_policy_tiers_snapshot" ON "policy_tiers"("snapshot_id", "tier_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tier_order" ON "policy_tiers"("snapshot_id", "tier_order");

-- CreateIndex
CREATE INDEX "idx_price_alerts_route" ON "price_alerts"("origin", "destination");

-- CreateIndex
CREATE INDEX "idx_price_alerts_user" ON "price_alerts"("user_id");

-- CreateIndex
CREATE INDEX "idx_profiles_email" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "rate_limit_counters_reset_at_idx" ON "rate_limit_counters"("reset_at");

-- CreateIndex
CREATE INDEX "idx_refund_logs_booking" ON "refund_logs"("booking_id");

-- CreateIndex
CREATE INDEX "idx_refund_logs_status" ON "refund_logs"("status");

-- CreateIndex
CREATE INDEX "idx_refund_logs_user" ON "refund_logs"("user_id");

-- CreateIndex
CREATE INDEX "idx_saved_trips_type" ON "saved_trips"("user_id", "type");

-- CreateIndex
CREATE INDEX "idx_saved_trips_user" ON "saved_trips"("user_id");

-- CreateIndex
CREATE INDEX "idx_src_city_checkin" ON "search_results_cache"("city_name", "checkin");

-- CreateIndex
CREATE INDEX "idx_src_expires_at" ON "search_results_cache"("expires_at");

-- CreateIndex
CREATE INDEX "idx_sessions_expires_at" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_processed_events_event_id_key" ON "stripe_processed_events"("event_id");

-- CreateIndex
CREATE INDEX "stripe_processed_events_pi_idx" ON "stripe_processed_events"("payment_intent_id");

-- CreateIndex
CREATE INDEX "stripe_processed_events_ref_idx" ON "stripe_processed_events"("booking_reference");

-- CreateIndex
CREATE INDEX "idx_unified_bookings_created" ON "unified_bookings"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_unified_bookings_metadata" ON "unified_bookings" USING GIN ("metadata");

-- CreateIndex
CREATE INDEX "idx_unified_bookings_provider" ON "unified_bookings"("provider");

-- CreateIndex
CREATE INDEX "idx_unified_bookings_status" ON "unified_bookings"("status");

-- CreateIndex
CREATE INDEX "idx_unified_bookings_type" ON "unified_bookings"("type");

-- CreateIndex
CREATE INDEX "idx_unified_bookings_user_id" ON "unified_bookings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_voucher_usage_user" ON "voucher_usage"("user_id");

-- CreateIndex
CREATE INDEX "idx_voucher_usage_voucher" ON "voucher_usage"("voucher_id");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- CreateIndex
CREATE INDEX "idx_vouchers_active" ON "vouchers"("active", "valid_from", "valid_until");

-- CreateIndex
CREATE INDEX "idx_vouchers_code" ON "vouchers"("code");

-- CreateIndex
CREATE INDEX "hotel_prebook_quotes_expires_at_idx" ON "hotel_prebook_quotes"("expires_at");

-- CreateIndex
CREATE INDEX "supplier_booking_attempts_created_at_idx" ON "supplier_booking_attempts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_support_assignment_events_conversation" ON "support_assignment_events"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "support_conversation_bookings_reference_idx" ON "support_conversation_bookings"("booking_reference");

-- CreateIndex
CREATE UNIQUE INDEX "support_conversations_guest_token_hash_key" ON "support_conversations"("guest_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "support_conversations_reference_key" ON "support_conversations"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "support_message_attachments_storage_key_key" ON "support_message_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "idx_support_message_attachments_message" ON "support_message_attachments"("message_id");

-- CreateIndex
CREATE INDEX "idx_support_messages_conversation" ON "support_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "support_notes_conversation_idx" ON "support_notes"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_support_suggestion_events_article" ON "support_suggestion_events"("article_id", "locale", "outcome", "created_at");

-- CreateIndex
CREATE INDEX "idx_support_suggestion_events_conversation" ON "support_suggestion_events"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "flight_booking_events_session_idx" ON "flight_booking_events"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "hotel_booking_events_booking_idx" ON "hotel_booking_events"("booking_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_booking_guests_position_uniq" ON "hotel_booking_guests"("booking_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_booking_payments_pi_uniq" ON "hotel_booking_payments"("payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_bookings_reference_uniq" ON "hotel_bookings"("booking_reference");

-- CreateIndex
CREATE INDEX "hotel_bookings_status_created_idx" ON "hotel_bookings"("status", "created_at");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_financial_events" ADD CONSTRAINT "booking_financial_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "flight_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_policy_snapshots" ADD CONSTRAINT "booking_policy_snapshots_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("booking_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_policy_snapshot_id_fkey" FOREIGN KEY ("policy_snapshot_id") REFERENCES "booking_policy_snapshots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "flight_booking_notes" ADD CONSTRAINT "flight_booking_notes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "flight_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "flight_booking_notes" ADD CONSTRAINT "flight_booking_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "flight_bookings" ADD CONSTRAINT "flight_bookings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "booking_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "flight_results_cache" ADD CONSTRAINT "flight_results_cache_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "flight_searches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "flight_searches" ADD CONSTRAINT "flight_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "flight_segments" ADD CONSTRAINT "flight_segments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "flight_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "golf_tee_time_schedules" ADD CONSTRAINT "golf_tee_time_schedules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "golf_courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "golf_tee_times" ADD CONSTRAINT "golf_tee_times_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "golf_courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "golf_tee_times" ADD CONSTRAINT "golf_tee_times_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "golf_tee_time_schedules"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "flight_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "policy_tiers" ADD CONSTRAINT "policy_tiers_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "booking_policy_snapshots"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refund_logs" ADD CONSTRAINT "refund_logs_applied_tier_id_fkey" FOREIGN KEY ("applied_tier_id") REFERENCES "policy_tiers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refund_logs" ADD CONSTRAINT "refund_logs_policy_snapshot_id_fkey" FOREIGN KEY ("policy_snapshot_id") REFERENCES "booking_policy_snapshots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "saved_trips" ADD CONSTRAINT "saved_trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "voucher_usage" ADD CONSTRAINT "voucher_usage_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_assignment_events" ADD CONSTRAINT "support_assignment_events_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_assignment_events" ADD CONSTRAINT "support_assignment_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_assignment_events" ADD CONSTRAINT "support_assignment_events_from_admin_id_fkey" FOREIGN KEY ("from_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_assignment_events" ADD CONSTRAINT "support_assignment_events_to_admin_id_fkey" FOREIGN KEY ("to_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_conversation_bookings" ADD CONSTRAINT "support_conversation_bookings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_conversation_bookings" ADD CONSTRAINT "support_conversation_bookings_linked_by_fkey" FOREIGN KEY ("linked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_message_attachments" ADD CONSTRAINT "support_message_attachments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_message_attachments" ADD CONSTRAINT "support_message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "support_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_message_attachments" ADD CONSTRAINT "support_message_attachments_uploaded_by_admin_id_fkey" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_admin_id_fkey" FOREIGN KEY ("sender_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_notes" ADD CONSTRAINT "support_notes_author_admin_id_fkey" FOREIGN KEY ("author_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_notes" ADD CONSTRAINT "support_notes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_suggestion_events" ADD CONSTRAINT "support_suggestion_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "flight_booking_events" ADD CONSTRAINT "flight_booking_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "booking_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hotel_booking_events" ADD CONSTRAINT "hotel_booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "hotel_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hotel_booking_guests" ADD CONSTRAINT "hotel_booking_guests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "hotel_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hotel_booking_payments" ADD CONSTRAINT "hotel_booking_payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "hotel_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ═══ Triggers (6) ══════════════════════════════════════════════════════

CREATE TRIGGER on_user_created AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER trg_admin_settings_updated_at BEFORE UPDATE ON public.admin_settings FOR EACH ROW EXECUTE FUNCTION update_admin_settings_updated_at();
CREATE TRIGGER trg_booking_sessions_updated_at BEFORE UPDATE ON public.booking_sessions FOR EACH ROW EXECUTE FUNCTION update_booking_sessions_updated_at();
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION update_notifications_updated_at();
CREATE TRIGGER trg_support_conversations_updated_at BEFORE UPDATE ON public.support_conversations FOR EACH ROW EXECUTE FUNCTION update_support_conversations_updated_at();
CREATE TRIGGER trg_unified_bookings_updated_at BEFORE UPDATE ON public.unified_bookings FOR EACH ROW EXECUTE FUNCTION update_unified_bookings_updated_at();

-- ═══ dbmate's ledger ════════════════════════════════════════════════════════

-- The schema above is already current, so every existing migration is marked applied.
-- Without this, `dbmate up` would replay all 14 against a database that has them, and
-- the three without IF NOT EXISTS would fail.
CREATE TABLE IF NOT EXISTS schema_migrations (version varchar(255) PRIMARY KEY);
INSERT INTO schema_migrations (version) VALUES
    ('20260907000004'),
    ('20260917000001'),
    ('20261015000001'),
    ('20261016000001'),
    ('20261104000001'),
    ('20261104000002'),
    ('20261104000003'),
    ('20261104000004'),
    ('20261104000005'),
    ('20261104000006'),
    ('20261104000007'),
    ('20261104000008'),
    ('20261104000009'),
    ('20261109000001')
ON CONFLICT (version) DO NOTHING;
