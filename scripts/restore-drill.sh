#!/usr/bin/env bash
# Restore DRILL: back up, DESTROY, restore, and prove the DATA survived.
#
# scripts/verify-restore.sh answers "is the restored app alive?". This answers the
# question Rule 0.8 actually asks — "did the data come back intact?" — because
# "the database started" is not integrity. Documentation is not evidence; only a
# dated run of this is.
#
# It ends with a NEGATIVE CONTROL: it breaks the restored data on purpose and
# requires the verifier to go RED. A gate never observed failing is decoration,
# so a drill that only ever prints PASS proves nothing about its own checks.
#
# Usage:
#   scripts/restore-drill.sh                     # against local compose postgres
#   PGURL=postgres://user:pw@host:5432/db scripts/restore-drill.sh
#
# Safety: it DROPS AND RECREATES the target database. It refuses to run against a
# host that is not local unless ALLOW_REMOTE_DRILL=yes is set, because the whole
# point of the script is destruction.
set -uo pipefail

PGURL="${PGURL:-postgres://afristage:afristage@localhost:5440/afristage}"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
WORK="$(mktemp -d)"
DUMP="$WORK/drill.dump"
trap 'rm -rf "$WORK"' EXIT

# Parse the URL so we can reach the maintenance DB to drop/create.
proto_stripped="${PGURL#*://}"
creds="${proto_stripped%%@*}"
hostpart="${proto_stripped#*@}"
DBNAME="${hostpart##*/}"; DBNAME="${DBNAME%%\?*}"
hostport="${hostpart%%/*}"
DBHOST="${hostport%%:*}"
MAINT="${PGURL%/*}/postgres"

case "$DBHOST" in
  localhost|127.0.0.1|::1|host.docker.internal) ;;
  *) [ "${ALLOW_REMOTE_DRILL:-no}" = "yes" ] || {
       echo "REFUSED: '$DBHOST' is not local and ALLOW_REMOTE_DRILL is not 'yes'."
       echo "This script DROPS the database. Point it at a scratch copy, never production."
       exit 2; }
     echo "!! remote drill authorised against $DBHOST" ;;
esac

pass=0; fail=0
note() { printf '  %-6s %s\n' "$1" "$2"; }
ok()   { if [ "$1" = 0 ]; then note PASS "$2"; pass=$((pass+1)); else note FAIL "$2"; fail=$((fail+1)); fi; }
q()    { psql "$PGURL" -Atqc "$1" 2>/dev/null; }

# ---------------------------------------------------------------------------
# The integrity suite. Run against whatever is in the database RIGHT NOW.
# Returns 0 if every invariant holds. Used three times: before the drill, after
# the restore, and against deliberately corrupted data.
# ---------------------------------------------------------------------------
integrity_report() {
  # tables+counts, one "name=count" per line, sorted — the fingerprint
  psql "$PGURL" -Atq -c "
    select table_name || '=' || (
      xpath('/row/c/text()',
        query_to_xml(format('select count(*) c from %I.%I', table_schema, table_name),
                     false, true, ''))
    )[1]::text
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name;" 2>/dev/null
}

# Each invariant returns the number of VIOLATIONS. Zero is healthy.
inv_unbalanced() { q "select count(*) from (select transaction_id from ledger_entries group by transaction_id having coalesce(sum(amount_minor) filter (where direction='DEBIT'),0) <> coalesce(sum(amount_minor) filter (where direction='CREDIT'),0)) t"; }
inv_short_legs() { q "select count(*) from (select transaction_id from ledger_entries group by transaction_id having count(*) < 2) t"; }
inv_mixed_ccy()  { q "select count(*) from (select transaction_id from ledger_entries group by transaction_id having count(distinct currency) <> 1) t"; }
inv_orphan_txn() { q "select count(*) from ledger_entries e left join ledger_transactions t on t.id=e.transaction_id where t.id is null"; }
inv_orphan_acct(){ q "select count(*) from ledger_entries e left join wallet_accounts a on a.id=e.account_id where a.id is null"; }
# The money guard itself must survive a restore. A dump that loses the trigger
# restores data that looks fine and silently stops being protected.
inv_trigger()    { q "select count(*) from pg_trigger where tgname='ledger_entries_balanced' and not tgisinternal"; }

run_checks() {
  local label="$1"
  echo ""
  echo "--- integrity: $label ---"
  local u s m ot oa tg
  u=$(inv_unbalanced); s=$(inv_short_legs); m=$(inv_mixed_ccy)
  ot=$(inv_orphan_txn); oa=$(inv_orphan_acct); tg=$(inv_trigger)
  [ "$u"  = 0 ] && ok 0 "ledger: debits == credits on every transaction" || ok 1 "ledger: $u UNBALANCED transaction(s)"
  [ "$s"  = 0 ] && ok 0 "ledger: every transaction has >= 2 legs"        || ok 1 "ledger: $s transaction(s) with a single leg"
  [ "$m"  = 0 ] && ok 0 "ledger: no mixed-currency transaction"          || ok 1 "ledger: $m mixed-currency transaction(s)"
  [ "$ot" = 0 ] && ok 0 "FK: no entry orphaned from its transaction"     || ok 1 "FK: $ot orphaned entr(ies)"
  [ "$oa" = 0 ] && ok 0 "FK: no entry orphaned from its wallet account"  || ok 1 "FK: $oa entr(ies) with no account"
  [ "$tg" = 1 ] && ok 0 "the balance trigger survived and is armed"      || ok 1 "balance trigger MISSING (found $tg)"
}

echo "=========================================================="
echo " AfriStage restore drill — $STAMP"
echo " target: $DBHOST/$DBNAME"
echo "=========================================================="

# --- 0. the database must actually have something in it -------------------
rows_before=$(q "select coalesce(sum(c),0) from (select (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint c from information_schema.tables where table_schema='public' and table_type='BASE TABLE') t")
if [ -z "$rows_before" ] || [ "$rows_before" -lt 10 ]; then
  echo "REFUSED: only '${rows_before:-0}' rows present — a drill over an empty database"
  echo "would pass vacuously. Seed or restore real data first."
  exit 2
fi
echo ""
echo "baseline: $rows_before rows across public schema"

FP_BEFORE="$WORK/before.txt"; integrity_report > "$FP_BEFORE"
MIG_BEFORE=$(q "select count(*) from _prisma_migrations")
run_checks "BEFORE (baseline must be green, or nothing after it can be attributed)"
if [ "$fail" -ne 0 ]; then
  echo ""
  echo "REFUSED: the baseline is already RED. A drill run from a broken baseline"
  echo "cannot attribute anything to the restore. Fix the data first."
  exit 2
fi

# --- 1. back up -----------------------------------------------------------
echo ""
echo "--- 1. backup ---"
pg_dump -Fc -f "$DUMP" "$PGURL" 2>"$WORK/dump.err"
ok $? "pg_dump completed$( [ -s "$WORK/dump.err" ] && echo " (stderr: $(head -c 200 "$WORK/dump.err"))")"
SIZE=$(wc -c < "$DUMP" | tr -d ' ')
[ "$SIZE" -gt 1000 ] && ok 0 "backup is non-trivial ($SIZE bytes)" || ok 1 "backup suspiciously small ($SIZE bytes)"

# --- 2. DESTROY -----------------------------------------------------------
echo ""
echo "--- 2. destroy ---"
psql "$MAINT" -Atqc "select pg_terminate_backend(pid) from pg_stat_activity where datname='$DBNAME' and pid<>pg_backend_pid()" >/dev/null 2>&1
psql "$MAINT" -Atqc "drop database \"$DBNAME\"" >/dev/null 2>"$WORK/drop.err"
ok $? "database dropped$( [ -s "$WORK/drop.err" ] && echo " ($(head -c 150 "$WORK/drop.err"))")"
gone=$(psql "$MAINT" -Atqc "select count(*) from pg_database where datname='$DBNAME'" 2>/dev/null)
[ "$gone" = 0 ] && ok 0 "confirmed gone — this is a real restore, not a copy" || ok 1 "database still present after drop"

# --- 3. restore -----------------------------------------------------------
echo ""
echo "--- 3. restore ---"
psql "$MAINT" -Atqc "create database \"$DBNAME\"" >/dev/null 2>&1
ok $? "empty database recreated"
pg_restore --no-owner --no-privileges -d "$PGURL" "$DUMP" 2>"$WORK/restore.err"
rc=$?
# pg_restore exits non-zero on ignorable warnings; the data checks below are the
# real verdict, so record the code but do not let it alone decide.
if [ $rc -eq 0 ]; then ok 0 "pg_restore completed cleanly"
else note WARN "pg_restore exit $rc — $(grep -c . "$WORK/restore.err") stderr line(s); data checks decide"; fi

# --- 4. verify the DATA ---------------------------------------------------
FP_AFTER="$WORK/after.txt"; integrity_report > "$FP_AFTER"
echo ""
echo "--- 4. data comparison ---"
if diff -q "$FP_BEFORE" "$FP_AFTER" >/dev/null; then
  ok 0 "every table's row count matches the pre-backup fingerprint ($(wc -l < "$FP_BEFORE" | tr -d ' ') tables)"
else
  ok 1 "row counts DIFFER after restore:"; diff "$FP_BEFORE" "$FP_AFTER" | head -20
fi
MIG_AFTER=$(q "select count(*) from _prisma_migrations")
[ "$MIG_BEFORE" = "$MIG_AFTER" ] && ok 0 "migration history intact ($MIG_AFTER applied)" || ok 1 "migrations $MIG_BEFORE -> $MIG_AFTER"
# Ask postgres to re-check every FK against the restored rows, not just trust them.
BADFK=$(psql "$PGURL" -Atq -c "
  do \$\$ declare r record; begin
    for r in select conrelid::regclass t, conname c from pg_constraint where contype='f' loop
      execute format('alter table %s validate constraint %I', r.t, r.c);
    end loop; end \$\$;" 2>&1 | grep -ci "error")
[ "$BADFK" = 0 ] && ok 0 "all foreign keys re-validated against restored rows" || ok 1 "$BADFK foreign key(s) failed validation"
run_checks "AFTER RESTORE"

# --- 5. negative control --------------------------------------------------
# Break it on purpose. If the suite still passes, every PASS above is worthless.
#
# Two different things are proven here, and conflating them is how a drill lies
# to itself. First: the live guard REFUSES a leg deletion through ordinary SQL —
# that is the money invariant doing its job. Second: corruption that arrives
# some other way (a bad restore, a torn page, a hand-edited dump) must still be
# DETECTED by the checks above. Only the second is a negative control; the first
# would silently substitute for it, because a delete that never lands leaves the
# data clean and every check passing for the wrong reason.
echo ""
echo "--- 5. negative control (the verifier must FAIL here) ---"
VICTIM=$(q "select transaction_id from ledger_entries group by transaction_id having count(*)>=2 limit 1")
if [ -z "$VICTIM" ]; then
  note WARN "no multi-leg transaction to corrupt — negative control SKIPPED"
  note WARN "the checks above are therefore UNPROVEN; seed money data and re-run"
  fail=$((fail+1))
else
  # 5a. the guard refuses the ordinary path
  refusal=$(psql "$PGURL" -Atqc "delete from ledger_entries where ctid = (select ctid from ledger_entries where transaction_id='$VICTIM' limit 1);" 2>&1 | head -1)
  case "$refusal" in
    *unbalanced*) ok 0 "the live guard REFUSED a leg deletion — ${refusal#*ERROR:  }" ;;
    *)            ok 1 "a ledger leg was deleted through ordinary SQL — the money guard did not fire" ;;
  esac

  # 5b. plant corruption behind the trigger's back, the way a bad restore would
  psql "$PGURL" -Atqc "alter table ledger_entries disable trigger ledger_entries_balanced" >/dev/null 2>&1
  psql "$PGURL" -Atqc "delete from ledger_entries where ctid = (select ctid from ledger_entries where transaction_id='$VICTIM' limit 1)" >/dev/null 2>&1
  psql "$PGURL" -Atqc "alter table ledger_entries enable trigger ledger_entries_balanced" >/dev/null 2>&1
  now_unbal=$(inv_unbalanced); now_short=$(inv_short_legs)
  if [ "${now_unbal:-0}" -gt 0 ] || [ "${now_short:-0}" -gt 0 ]; then
    ok 0 "silently-corrupted data was DETECTED (unbalanced=$now_unbal short=$now_short) — the checks can fail"
  else
    ok 1 "corruption went UNDETECTED — these integrity checks prove nothing"
  fi
  # put it back, and prove the restore path a second time
  psql "$MAINT" -Atqc "select pg_terminate_backend(pid) from pg_stat_activity where datname='$DBNAME' and pid<>pg_backend_pid()" >/dev/null 2>&1
  psql "$MAINT" -Atqc "drop database \"$DBNAME\"" >/dev/null 2>&1
  psql "$MAINT" -Atqc "create database \"$DBNAME\"" >/dev/null 2>&1
  pg_restore --no-owner --no-privileges -d "$PGURL" "$DUMP" >/dev/null 2>&1
  integrity_report > "$WORK/final.txt"
  diff -q "$FP_BEFORE" "$WORK/final.txt" >/dev/null && ok 0 "restored again from the same backup — data back to baseline" || ok 1 "second restore did not reproduce the baseline"
  [ "$(inv_unbalanced)" = 0 ] && ok 0 "ledger balanced again after the second restore" || ok 1 "ledger still unbalanced after second restore"
fi

echo ""
echo "=========================================================="
echo "  RESULT: $pass passed, $fail failed   ($STAMP)"
echo "=========================================================="
[ "$fail" = 0 ] || exit 1
echo "RESTORE DRILL PASSED — record this date in docs/disaster-recovery.md"
