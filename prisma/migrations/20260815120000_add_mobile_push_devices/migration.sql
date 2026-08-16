CREATE TABLE "MobilePushDevice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "installationId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobilePushDevice_installationId_key" ON "MobilePushDevice"("installationId");
CREATE INDEX "MobilePushDevice_enabled_lastSeenAt_idx" ON "MobilePushDevice"("enabled", "lastSeenAt");
