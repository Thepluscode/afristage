-- CreateTable
CREATE TABLE "fraud_assessments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "risk_score" DOUBLE PRECISION NOT NULL,
    "recommended_action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fraud_assessments_user_id_key" ON "fraud_assessments"("user_id");
