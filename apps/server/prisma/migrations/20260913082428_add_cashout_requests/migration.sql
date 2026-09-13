-- CreateEnum
CREATE TYPE "CashOutRequestStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "CashOutRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "CashOutRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "balanceAfter" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "agentId" TEXT NOT NULL,

    CONSTRAINT "CashOutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashOutRequest_requestId_key" ON "CashOutRequest"("requestId");

-- CreateIndex
CREATE INDEX "CashOutRequest_agentId_createdAt_idx" ON "CashOutRequest"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "CashOutRequest_status_idx" ON "CashOutRequest"("status");

-- AddForeignKey
ALTER TABLE "CashOutRequest" ADD CONSTRAINT "CashOutRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
