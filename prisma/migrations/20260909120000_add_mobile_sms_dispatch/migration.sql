CREATE TABLE "MobileSmsDispatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "profile" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "MobileSmsDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileSmsDispatch_idempotencyKey_key" ON "MobileSmsDispatch"("idempotencyKey");
CREATE INDEX "MobileSmsDispatch_status_createdAt_idx" ON "MobileSmsDispatch"("status", "createdAt");
CREATE INDEX "MobileSmsDispatch_phone_createdAt_idx" ON "MobileSmsDispatch"("phone", "createdAt");
