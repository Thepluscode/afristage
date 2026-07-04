-- AlterEnum
ALTER TYPE "LedgerTransactionType" ADD VALUE 'EVENT_PRIZE';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "prize_pool_coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settled_at" TIMESTAMP(3);
