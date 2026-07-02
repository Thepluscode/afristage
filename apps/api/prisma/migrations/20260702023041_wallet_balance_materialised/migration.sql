-- This is an empty migration.
-- Backfill: materialise each account's balance from its existing entries so
-- the column starts consistent with the source of truth.
UPDATE "wallet_accounts" wa
SET "balance_minor" = COALESCE(
  (SELECT SUM(CASE WHEN le."direction" = 'CREDIT' THEN le."amount_minor" ELSE -le."amount_minor" END)
   FROM "ledger_entries" le
   WHERE le."account_id" = wa."id"),
  0
);
