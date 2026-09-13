-- CreateEnum
CREATE TYPE "DepositRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'NOT_FOUND', 'FAILED');

-- CreateTable
CREATE TABLE "DepositRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "DepositRequestStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DOUBLE PRECISION,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "agentId" TEXT NOT NULL,

    CONSTRAINT "DepositRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositRequest_requestId_key" ON "DepositRequest"("requestId");

-- CreateIndex
CREATE INDEX "DepositRequest_agentId_createdAt_idx" ON "DepositRequest"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "DepositRequest_status_idx" ON "DepositRequest"("status");

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
