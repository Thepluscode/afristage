# Restore drill record

One row per **executed** run of `scripts/restore-drill.sh`. This file is the
evidence; `docs/disaster-recovery.md` is the procedure. Nothing goes in here that
was not actually run — an entry written in advance of a drill is a lie with a date
on it. A drill older than 90 days is stale: re-run it and add a row.

---

## Drill performed: 2026-09-05

- **Scope:** local Docker compose Postgres 16 (`localhost:5440/afristage`), seeded
  schema — 42 tables, 157 rows, 33 migrations applied.
- **Result:** `25 passed, 0 failed` (script exit 0).
- **Method:** `pg_dump -Fc` → `DROP DATABASE` → `CREATE DATABASE` → `pg_restore`.
  The database was confirmed **absent** between the drop and the restore, so this
  was a real recovery rather than a copy alongside the original.

**Data integrity validated after restore** (not merely "the database started"):

| Check | Result |
|---|---|
| Per-table row counts vs pre-backup fingerprint | identical across all 42 tables |
| Migration history | 33 applied, unchanged |
| Foreign keys | every FK constraint re-validated against the restored rows |
| Ledger: debits == credits per transaction | 0 unbalanced |
| Ledger: at least 2 legs per transaction | 0 violations |
| Ledger: single currency per transaction | 0 violations |
| Orphaned ledger entries (transaction / wallet account) | 0 |
| `ledger_entries_balanced` trigger | survived the dump/restore, still armed |

**Negative control — the checks were watched failing.** A ledger leg was deleted
with the balance trigger disabled, planting corruption the way a bad restore or a
torn page would rather than through the application. The suite went red
(`unbalanced=1`), which is what makes the greens above mean something. Restoring a
second time from the same backup returned the data to the baseline fingerprint and
the ledger to balanced.

**Separately observed:** the live money guard **refuses** an ordinary leg deletion —
`ledger transaction 2f628dbf… is unbalanced: debits=0 credits=10`, transaction
rolled back, row count unchanged. That is the invariant working, and it is recorded
here as a distinct fact so it is never mistaken for the negative control above.

**Scope limit — read this before quoting the row.** This drill exercised the restore
*procedure* and the integrity checks. It has **never restored a Railway managed
snapshot**; the provider's backups remain unproven, as do the RPO and RTO, which
`disaster-recovery.md` still states only as targets. Under Rule 0.8 the honest
level for this evidence is **RESTORE TESTED FOR DEVELOPMENT**. Reaching
`CONTROLLED PILOT READY` requires restoring a real Railway snapshot into a scratch
database and re-running the same script against it:

```bash
PGURL='postgres://...scratch...' ALLOW_REMOTE_DRILL=yes scripts/restore-drill.sh
```
