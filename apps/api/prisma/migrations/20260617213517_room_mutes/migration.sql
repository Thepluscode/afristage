-- CreateTable
CREATE TABLE "room_mutes" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "muted_until" TIMESTAMP(3) NOT NULL,
    "muted_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_mutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_mutes_room_id_user_id_key" ON "room_mutes"("room_id", "user_id");

