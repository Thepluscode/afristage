-- AlterTable
ALTER TABLE "payout_requests" DROP COLUMN "amount_minor",
DROP COLUMN "currency",
ADD COLUMN     "coin_amount" BIGINT NOT NULL,
ADD COLUMN     "coin_to_fiat_minor_rate" INTEGER NOT NULL,
ADD COLUMN     "fiat_currency" TEXT NOT NULL,
ADD COLUMN     "fiat_minor" BIGINT NOT NULL,
ADD COLUMN     "idempotency_key" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payout_requests_idempotency_key_key" ON "payout_requests"("idempotency_key");

