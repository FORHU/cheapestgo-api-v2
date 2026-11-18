# db/baseline.sql — how to use it and how to regenerate it

`db/migrations` has no beginning. Its earliest entry is 2026-09-07 and every migration only
*adds* to a schema inherited from v1, so an empty Postgres stays empty. `db/baseline.sql`
is that missing beginning.

## Using it

`docker compose up` already does this: `db/baseline.sql` is mounted into the postgres
service's `/docker-entrypoint-initdb.d`, which Postgres runs once, when the data volume is
new. Nothing else is needed — bring the stack up and sign-up works.

By hand, against an empty database:

```bash
psql -U cheapestgo -d cheapestgo -f db/baseline.sql
```

It is **not** a dbmate migration, deliberately: as one, dbmate would try to apply it to dev
and production, where every table already exists and three of the fourteen migrations do not
use `IF NOT EXISTS`. It ends by marking all fourteen applied, so `dbmate up` afterwards is a
no-op and only genuinely new migrations run.

## Regenerating it

Needed whenever the schema changes — a new migration, or a new function or trigger.

```bash
# 1. tables, from the Prisma datamodel (no database needed)
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  > /tmp/baseline-schema.sql

# 2. functions and triggers, which Prisma does not model, from a live database
docker compose exec -T postgres psql -U cheapestgo -d cheapestgo -tA -c "
SELECT pg_get_functiondef(p.oid) || E';\n' FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
 ORDER BY p.proname;" > /tmp/baseline-functions.sql

docker compose exec -T postgres psql -U cheapestgo -d cheapestgo -tA -c "
SELECT pg_get_triggerdef(t.oid) || ';' FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname = 'public'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
 ORDER BY tgname;" > /tmp/baseline-triggers.sql
```

Then concatenate in this order, which is not arbitrary:

1. **functions** — `chat_conversations.reference` defaults to `mint_chat_reference()`, so the
   table cannot be created before the function exists.
2. **tables**
3. **triggers** — they need their tables.
4. **the `schema_migrations` rows.**

Two traps, both of which produced a broken file before this was written:

- **Do not generate step 1 through PowerShell with `2>&1`.** It merges stderr into the file,
  and the first line of the result is a .NET stack trace rather than SQL. Postgres aborts
  init on it, and the only symptom is a container that exits.
- The `-e` filter on `pg_depend` matters. Without it the dump includes the twelve `gtrgm_*`
  functions belonging to the `pg_trgm` extension, which fail because the extension owns them.

## Verifying it

Against a throwaway container, so no existing volume is touched:

```bash
docker run -d --name baseline-test \
  -e POSTGRES_USER=cheapestgo -e POSTGRES_PASSWORD=cheapestgo -e POSTGRES_DB=cheapestgo \
  -v "$PWD/db/baseline.sql:/docker-entrypoint-initdb.d/01-baseline.sql:ro" \
  postgres:17-alpine
sleep 30
docker logs baseline-test 2>&1 | grep -E "ERROR:|FATAL:"      # expect nothing
docker exec baseline-test psql -U cheapestgo -d cheapestgo -tA -c \
  "select count(*) from information_schema.tables where table_schema='public';"
docker rm -f baseline-test
```

As of 2026-11-18 that gives 70 tables, 12 functions, 6 triggers, 14 migrations marked
applied, and an `INSERT INTO users` creates the matching `profiles` row via `on_user_created`.
