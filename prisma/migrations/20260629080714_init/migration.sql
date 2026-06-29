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

    CONSTRAINT "flight_segments_pkey" PRIMARY KEY ("id")
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

    CONSTRAINT "stripe_processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tgx_destination_cache" (
    "city_key" TEXT NOT NULL,
    "destination_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

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
CREATE INDEX "hotel_content_fetched_at_idx" ON "hotel_content"("fetched_at");

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
