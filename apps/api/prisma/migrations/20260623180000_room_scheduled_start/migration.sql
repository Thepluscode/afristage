-- Scheduled rooms: an optional announced start time powers the "upcoming" feed.
ALTER TABLE "live_rooms" ADD COLUMN "scheduled_start_at" TIMESTAMP(3);
CREATE INDEX "live_rooms_status_scheduled_start_at_idx" ON "live_rooms" ("status", "scheduled_start_at");
