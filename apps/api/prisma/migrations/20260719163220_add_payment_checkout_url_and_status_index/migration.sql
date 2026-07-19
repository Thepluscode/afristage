-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN     "checkout_url" TEXT;

-- CreateIndex
CREATE INDEX "payment_intents_status_created_at_idx" ON "payment_intents"("status", "created_at");
