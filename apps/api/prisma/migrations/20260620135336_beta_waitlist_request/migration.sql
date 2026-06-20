-- CreateEnum
CREATE TYPE "BetaRequestStatus" AS ENUM ('PENDING', 'INVITED', 'DECLINED');

-- CreateTable
CREATE TABLE "beta_requests" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "category" TEXT,
    "country" TEXT,
    "status" "BetaRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beta_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beta_requests_email_key" ON "beta_requests"("email");

-- CreateIndex
CREATE INDEX "beta_requests_status_created_at_idx" ON "beta_requests"("status", "created_at");
