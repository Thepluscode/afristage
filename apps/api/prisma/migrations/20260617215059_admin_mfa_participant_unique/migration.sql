-- DropIndex
DROP INDEX "room_participants_room_id_user_id_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_recovery_codes" TEXT[],
ADD COLUMN     "mfa_secret" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "room_participants_room_id_user_id_key" ON "room_participants"("room_id", "user_id");

