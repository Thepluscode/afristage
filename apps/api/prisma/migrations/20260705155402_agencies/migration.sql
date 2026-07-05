-- AlterEnum
ALTER TYPE "WalletAccountType" ADD VALUE 'AGENCY_EARNING';

-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "country" TEXT,
    "commission_bps" INTEGER NOT NULL DEFAULT 1000,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_creators" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "creator_user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_creators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_name_key" ON "agencies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "agency_creators_creator_user_id_key" ON "agency_creators"("creator_user_id");

-- CreateIndex
CREATE INDEX "agency_creators_agency_id_idx" ON "agency_creators"("agency_id");

-- AddForeignKey
ALTER TABLE "agency_creators" ADD CONSTRAINT "agency_creators_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
