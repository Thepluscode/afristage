-- Make a half-posted ledger transaction impossible, not merely detectable.
--
-- The balance rule ("every transaction has >= 2 entries, one currency, debits =
-- credits") was enforced only in LedgerService.postTransaction. The local
-- database nonetheless held four transactions from 2026-07-18 written straight
-- past it — two with no entries at all and two with a lone CREDIT of 500 COIN,
-- which is 1000 coins conjured from nothing. LedgerIntegrityService caught it,
-- but only after the fact, and only for whoever was reading the logs.
--
-- Anything that writes these tables directly — a migration, a manual repair, a
-- future service, a compromised path — can mint money. Application-level
-- invariants do not bind the database, so the invariant moves into the database.
--
-- DEFERRABLE INITIALLY DEFERRED is essential, not decoration: postTransaction
-- inserts the transaction row and then its entries within one transaction, so
-- an immediate trigger would fire while the row legitimately has zero entries
-- and reject every honest post. Deferred, the check runs once at COMMIT, when
-- the transaction is either whole or absent.
--
-- Existing rows are NOT validated: constraint triggers apply to new writes
-- only. That is deliberate — a migration that fails on historical data is a
-- migration that cannot be deployed. Pre-existing violations remain the
-- integrity checker's business.

CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_txn       text;
  v_entries   int;
  v_debits    bigint;
  v_credits   bigint;
  v_currencies int;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    v_txn := COALESCE(NEW.id, OLD.id);
  ELSE
    v_txn := COALESCE(NEW.transaction_id, OLD.transaction_id);
  END IF;

  -- The transaction may have been removed in this same commit. Nothing does
  -- that today, but a trigger that invented a violation for a row that no
  -- longer exists would block legitimate cleanup forever.
  IF NOT EXISTS (SELECT 1 FROM ledger_transactions WHERE id = v_txn) THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         COALESCE(sum(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0),
         COALESCE(sum(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0),
         count(DISTINCT currency)
    INTO v_entries, v_debits, v_credits, v_currencies
    FROM ledger_entries
   WHERE transaction_id = v_txn;

  IF v_entries < 2 THEN
    RAISE EXCEPTION 'ledger transaction % has % entries: a double entry needs at least 2',
      v_txn, v_entries USING ERRCODE = 'check_violation';
  END IF;

  IF v_currencies <> 1 THEN
    RAISE EXCEPTION 'ledger transaction % spans % currencies: mixed-currency posting is not allowed',
      v_txn, v_currencies USING ERRCODE = 'check_violation';
  END IF;

  IF v_debits <> v_credits THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced: debits=% credits=%',
      v_txn, v_debits, v_credits USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

-- Two triggers, because either table can be the one left inconsistent: a
-- transaction inserted with no entries never touches ledger_entries, and an
-- entry deleted or altered never touches ledger_transactions.
DROP TRIGGER IF EXISTS ledger_transactions_balanced ON ledger_transactions;
CREATE CONSTRAINT TRIGGER ledger_transactions_balanced
  AFTER INSERT OR UPDATE ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();

DROP TRIGGER IF EXISTS ledger_entries_balanced ON ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();
