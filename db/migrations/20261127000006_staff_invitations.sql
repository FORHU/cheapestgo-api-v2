-- migrate:up
-- The schema this repo's deploy actually applies. `prisma/migrations/` had a copy of this same
-- CREATE TABLE, which `dbmate up` (deploy-dev.yml / deploy-prod.yml) never runs — only this
-- directory does. Left as the only copy, that table never existed outside a local `prisma
-- migrate dev` run: every call to `prisma.staff_invitations.*` would 500 in dev and prod,
-- CI green the whole time, because nothing in the suite hits a real database (see the review
-- comment on PR #125). ADR-0001 says the same thing structurally: db/migrations + dbmate owns
-- the schema, prisma/migrations stays out of it.
CREATE TABLE staff_invitations (
    id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email       text        NOT NULL,
    role        text        NOT NULL,
    token_hash  text        NOT NULL,
    invited_by  uuid        NOT NULL REFERENCES users (id),
    expires_at  timestamptz NOT NULL,
    accepted_at timestamptz,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX staff_invitations_token_hash_key ON staff_invitations (token_hash);
-- `findPendingByEmail` filters this column on every invite; the index earns its keep there.
CREATE INDEX idx_staff_invitations_email ON staff_invitations (email);

-- migrate:down
DROP TABLE staff_invitations;
