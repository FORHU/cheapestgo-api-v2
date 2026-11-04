-- migrate:up
-- The golf courses CheapestGo can arrange play at (CONTEXT.md, "Golf Course").
--
-- There is no golf supplier behind this table. The team curates it by hand in the admin, and a
-- course reaches the storefront only once it is published. Nothing here is bookable yet: the
-- course page's one action is the support chat, and tee times arrive in a later slice
-- (app-v2 docs/superpowers/specs/2026-11-04-golf-catalogue-design.md).
--
-- `green_fee_from` is a guide "from" price per player in the course's own `currency`. The API
-- restates it in the viewer's Display Currency; it is never a quote and nothing is charged from it.
--
-- The rules are v1's (cheapest-go-app, feat/golf-courses), restated here for v2 rather than copied:
-- v1's migration numbers already collide with v2's, and dbmate keys on version alone.
--
-- `status` is text with a CHECK rather than an enum, so a new state is a constraint swap.
-- `amenities` is a closed list enforced by the API's zod schema, not here, so adding one is a code
-- change rather than a migration.
--
-- Additive only, and re-running it by hand is harmless.

CREATE TABLE IF NOT EXISTS golf_courses (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text        NOT NULL,
    name            text        NOT NULL,
    country         text        NOT NULL,
    city            text        NOT NULL,
    address         text,
    description     text        NOT NULL DEFAULT '',
    holes           integer     NOT NULL,
    par             integer,
    green_fee_from  numeric(10,2),
    currency        char(3)     NOT NULL DEFAULT 'USD',
    image_urls      text[]      NOT NULL DEFAULT '{}',
    amenities       text[]      NOT NULL DEFAULT '{}',
    status          text        NOT NULL DEFAULT 'draft',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT golf_courses_slug_key          UNIQUE (slug),
    CONSTRAINT golf_courses_slug_format_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT golf_courses_holes_check       CHECK (holes IN (9, 18, 27, 36)),
    CONSTRAINT golf_courses_par_check         CHECK (par IS NULL OR par BETWEEN 27 AND 144),
    CONSTRAINT golf_courses_green_fee_check   CHECK (green_fee_from IS NULL OR green_fee_from >= 0),
    CONSTRAINT golf_courses_currency_check    CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT golf_courses_status_check      CHECK (status IN ('draft', 'published'))
);

-- The storefront's list: published courses, optionally in one country.
CREATE INDEX IF NOT EXISTS idx_golf_courses_status_country ON golf_courses (status, country);

-- migrate:down
DROP TABLE IF EXISTS golf_courses;
