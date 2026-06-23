-- "Remind me" for scheduled rooms; fired and cleared when the room goes live.
CREATE TABLE "room_reminders" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_reminders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "room_reminders_room_id_user_id_key" ON "room_reminders" ("room_id", "user_id");
CREATE INDEX "room_reminders_room_id_idx" ON "room_reminders" ("room_id");
