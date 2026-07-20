# Disaster recovery

The database is the business. This is how it's backed up and how to get it back —
tested the hard way (the 2026-07 disk-full episode corrupted Docker and wiped the
local Postgres volume; recovery below is the path that worked).

A restore is not done until `scripts/verify-restore.sh` passes.

## Backups (verify these are ON — do not assume)

Production Postgres is Railway-managed (Rule 0: use the managed backups, don't
build a bespoke system). **`railway volume list` shows only `redis-volume`**, so
the Postgres data/backup config is not obvious from the CLI — confirm it in the
dashboard, don't trust that it exists:

- Railway → project `afristage` → **Postgres service → Backups**: automated backups
  **enabled**, and note the **retention** and **schedule** (daily minimum).
- Record RPO (max acceptable data loss — target: ≤24h with daily backups; enable
  point-in-time recovery if the plan supports it) and RTO (target: < 1h to a
  verified restore).
- **Redis is a cache, not a source of truth** — it needs no backup; the app
  rebuilds it (wallets refetch, feed cache regenerates). Losing Redis is not a DR event.

## Restore procedures

### A. Production — restore from a Railway backup (real data; NEVER re-seed)
1. Railway → Postgres → Backups → pick the latest good snapshot → **Restore**
   (or provision a new Postgres from the backup and repoint `DATABASE_URL`).
2. The api's `preDeployCommand` runs `prisma migrate deploy` on next deploy, so
   the schema reconciles automatically. If restoring in place, redeploy the api
   (`railway up --service api --detach`) to run pending migrations.
3. Run the verification below. **Do not run the seed** — it is dev/staging only
   and would inject fixture accounts into real data.

### B. Total loss with no usable backup (dev / staging only)
Rebuild an empty database to a known-good seeded state — the exact path used to
recover the wiped local volume this session:
```bash
# schema
DATABASE_URL=<target> npx prisma migrate deploy   # applies all migrations in order
# fixtures (STAGING/DEV ONLY — never production)
DATABASE_URL=<target> npx prisma db seed           # ts-node prisma/seed.ts
```
On Railway, run these against the app's ACTUAL database from inside the api
container (see the gotcha below), then redeploy.

### C. Docker / DB corruption (local compose, or a stuck container)
The sequence that recovered the corrupted stack this session:
```bash
osascript -e 'quit app "Docker"'; open -a Docker      # restart the Docker VM (clears I/O corruption)
docker compose down && docker compose up -d           # recreate containers (volumes preserved)
# if the volume was wiped ("relation \"users\" does not exist"):
DATABASE_URL=postgresql://afristage:afristage@localhost:5440/afristage npx prisma migrate deploy
DATABASE_URL=postgresql://afristage:afristage@localhost:5440/afristage npx prisma db seed
```

## The Railway DB gotchas (these cost hours — read before touching prod data)
- The app's database is named **`railway`** on `postgres.railway.internal`, **not**
  `afristage`. `railway connect postgres` may drop you in a *different* database
  (or a stale instance) whose writes never reach the app.
- The reliable way to run a mutation/migration against the app's real DB is from
  **inside the api container**: `railway ssh --service api` then run
  `npx prisma ...` (the internal host + `railway` db resolve there). This is how
  the DB name mismatch was finally resolved.

## Verify the restore (proven, not assumed)
```bash
scripts/verify-restore.sh https://api-production-e12f.up.railway.app/api [ADMIN_JWT]
```
It checks, and fails loudly on any:
1. `GET /health` → `status: ok` (the app is up).
2. `GET /health/ready` → `db: true, redis: true` (dependencies reachable).
3. (with an admin token) `GET /admin/ledger/integrity` → `ok: true`,
   `unbalancedTransactions: 0` — **the money survived the restore intact**.
4. A login smoke against a known account returns a token.

Only when all pass is the restore complete. Log the result in the incident note
(`docs/runbook.md` → incident playbooks).
