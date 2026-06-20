-- CreateEnum
CREATE TYPE "CreatorApprovalStatus" AS ENUM ('NOT_APPLIED', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('NUDITY', 'HARASSMENT', 'HATE', 'SCAM', 'UNDERAGE_RISK', 'SELF_HARM', 'VIOLENCE', 'SPAM', 'COPYRIGHT', 'IMPERSONATION', 'PAYMENT_FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "BetaInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BetaInviteType" AS ENUM ('VIEWER', 'CREATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "SupportTicketType" AS ENUM ('GENERAL', 'PAYMENT', 'PAYOUT', 'MODERATION', 'ACCOUNT', 'CREATOR_APPLICATION', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "creator_profiles" ADD COLUMN     "approval_status" "CreatorApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" TEXT;

-- AlterTable
ALTER TABLE "reports" DROP COLUMN "reason",
ADD COLUMN     "reason" "ReportReason" NOT NULL;

-- CreateTable
CREATE TABLE "beta_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "code_hash" TEXT NOT NULL,
    "type" "BetaInviteType" NOT NULL,
    "status" "BetaInviteStatus" NOT NULL DEFAULT 'PENDING',
    "invited_by_id" TEXT,
    "accepted_by_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beta_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "assigned_admin_id" TEXT,
    "type" "SupportTicketType" NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "related_payment_id" TEXT,
    "related_payout_id" TEXT,
    "related_room_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "beta_invites_email_idx" ON "beta_invites"("email");

-- CreateIndex
CREATE INDEX "beta_invites_phone_idx" ON "beta_invites"("phone");

-- CreateIndex
CREATE INDEX "beta_invites_status_idx" ON "beta_invites"("status");

-- CreateIndex
CREATE INDEX "support_tickets_requester_id_idx" ON "support_tickets"("requester_id");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "support_ticket_messages_ticket_id_created_at_idx" ON "support_ticket_messages"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

