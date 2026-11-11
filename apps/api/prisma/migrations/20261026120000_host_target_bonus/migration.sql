-- AlterEnum
ALTER TYPE "LedgerTransactionType" ADD VALUE 'TARGET_BONUS';

-- CreateTable
CREATE TABLE "target_bonus_tiers" (
    "id" TEXT NOT NULL,
    "min_gift_coins" INTEGER NOT NULL,
    "bonus_coins" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_bonus_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "target_bonus_tiers_min_gift_coins_key" ON "target_bonus_tiers"("min_gift_coins");
