-- Destination snapshot captured at payout-request time so reviewers can disburse
-- even after the creator deletes the underlying payout method.
ALTER TABLE "payout_requests" ADD COLUMN "payout_provider" TEXT;
ALTER TABLE "payout_requests" ADD COLUMN "payout_destination_label" TEXT;
ALTER TABLE "payout_requests" ADD COLUMN "payout_destination_reference" TEXT;
ALTER TABLE "payout_requests" ADD COLUMN "payout_country" TEXT;
