-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerTransactionType" ADD VALUE 'MISSION_REWARD';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'PROMO_FUNDING';

-- AlterEnum
ALTER TYPE "WalletAccountType" ADD VALUE 'PROMO';

-- CreateTable
CREATE TABLE "mission_claims" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mission_key" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "reward_coins" INTEGER NOT NULL,
    "ledger_transaction_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mission_claims_day_idx" ON "mission_claims"("day");

-- CreateIndex
CREATE UNIQUE INDEX "mission_claims_user_id_mission_key_day_key" ON "mission_claims"("user_id", "mission_key", "day");
