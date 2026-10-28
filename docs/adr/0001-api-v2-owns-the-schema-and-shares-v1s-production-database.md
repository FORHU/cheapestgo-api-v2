# ADR 0001 — api-v2 Owns the Schema, and Production Keeps One Database

**Date:** 2026-10-26
**Status:** Accepted — supersedes the "v2 never writes a migration" clause of ADR-0018 in the
`cheapest-go-app` repo (`docs/adr/0018-v2-has-its-own-database.md`)

## Context

v1 is being retired and v2 takes over production. Two decisions in ADR-0018 do not survive that, and both
have to be made deliberately rather than discovered during the cutover.

ADR-0018 says **dbmate in v1's `db/migrations/` is the only author of schema** and **v2 never writes a
migration**. That was right while v2 was being rebuilt feature by feature against a disposable copy: a bad
migration in v2 could not reach the data v1 developed against, and "we broke it, we fix it" was one
dump-and-restore. It stops being right the moment the repo holding those 62 migrations is the one being
switched off.

ADR-0018 also keeps v2 on its own database, refreshed from v1's. In development that isolation is the
point. In production it would mean a cutover that cannot be undone: once a customer books against a
separate v2 database, rolling back to v1 means reconciling two live datasets of real bookings.

## Decision

**api-v2 becomes the schema owner.** `db/migrations/` (62 files), `db/schema.sql`, the runner and the
migration-prefix test move into this repo as they are. dbmate stays — changing the owner and the migration
tool in the same window, against live booking data, is two risks where one will do. `prisma db pull` still
regenerates `schema.prisma` afterwards; `prisma/migrations/` stays deleted.

**The move happens at cutover, not before.** Nothing reads migrations at runtime, so moving them early
buys nothing and takes the schema history out of the repo that is still serving production. Until the
flip, v1 holds them and v1 is the rollback.

**Production keeps one database.** api-v2 points at the RDS v1 already uses. No export, no maintenance
window, no reconciliation: this schema was derived from that database by `pg_dump` and `prisma db pull`,
so it already matches. v1 stays deployed and untouched on a spare hostname.

Cutover is therefore a proxy flip, and so is rollback. Every booking v2 writes is already in the database
v1 reads, so falling back costs nothing but the flip.

## Alternatives Considered

**Keep v1 as a schema-only repo.** Nothing moves and ADR-0018 stands. Rejected: a repository nobody
deploys, that everyone must still remember to use, drifts from the only code that reads it.

**Switch to Prisma Migrate.** One toolchain instead of two, and `prisma db pull` stops being a required
step after every change. Rejected for now: baselining Prisma Migrate against live production data during
the same window as the cutover changes the tool and the owner at once. Worth revisiting afterwards, from
a quiet week.

**A fresh production database for v2, with a data migration.** Preserves ADR-0018's isolation into
production. Rejected: it makes the cutover one-way. The ability to roll back with a proxy flip is worth
more than the isolation, which existed to protect a v2 that was still being built.

## Consequences

- **ADR-0018's isolation rationale no longer applies to production.** It still holds for local
  development — 5433 and 5434 stay separate, and the dump-and-restore refresh is unchanged.
- **A bad migration now reaches production directly.** The safety net that made ADR-0018 cheap is gone,
  because there is no second database to rebuild from. Migrations need review they did not need before.
- **The runner already scans the directory**, so nothing needs fixing on the way over. It was once a
  hand-kept array that had drifted to 22 of 59 files — including the two that create `users` — and the
  preflight only checked for listed-but-missing, which is the mistake nobody makes. It now reads the
  directory and audits every version for collisions. Worth knowing because the lesson is recorded in the
  file and easy to re-break.
- **v1's cron workflows must be switched off at cutover.** They curl `cheapestgo.com/api/cron/*`; after
  the flip those paths do not exist, and the work silently stops being done.
- **The cron container must be deployed.** `docker/cron/crontab` lists every scheduled job and has never
  been part of any deploy workflow, so no scheduled job has ever run outside local development.
- **v1 cannot be deleted at cutover.** It is the rollback, and it holds the migration history until that
  move is made.
