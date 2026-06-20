-- DropIndex
DROP INDEX "wallet_accounts_user_id_account_type_currency_idx";

-- CreateIndex
CREATE UNIQUE INDEX "gift_transactions_ledger_transaction_id_key" ON "gift_transactions"("ledger_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "gifts_name_key" ON "gifts"("name");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_user_id_account_type_currency_key" ON "wallet_accounts"("user_id", "account_type", "currency");


-- System wallet accounts (user_id IS NULL) need a partial unique index.
CREATE UNIQUE INDEX "wallet_accounts_system_unique"
  ON "wallet_accounts" ("account_type", "currency") WHERE "user_id" IS NULL;
