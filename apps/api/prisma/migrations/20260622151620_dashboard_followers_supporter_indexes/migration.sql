-- CreateIndex
CREATE INDEX "follows_following_id_idx" ON "follows"("following_id");

-- CreateIndex
CREATE INDEX "gift_transactions_creator_id_viewer_id_idx" ON "gift_transactions"("creator_id", "viewer_id");
