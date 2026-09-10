ALTER TABLE "MobilePushDevice"
ADD COLUMN "label" TEXT,
ADD COLUMN "deviceType" TEXT NOT NULL DEFAULT 'TEST',
ADD COLUMN "phoneNumber" TEXT,
ADD COLUMN "simSlot" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "manufacturer" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "appVersion" TEXT,
ADD COLUMN "smsPrimary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastSmsAt" TIMESTAMP(3);

ALTER TABLE "MobileSmsDispatch" ADD COLUMN "deviceId" TEXT;

CREATE INDEX "MobilePushDevice_smsPrimary_enabled_idx"
ON "MobilePushDevice"("smsPrimary", "enabled");

CREATE INDEX "MobileSmsDispatch_deviceId_status_createdAt_idx"
ON "MobileSmsDispatch"("deviceId", "status", "createdAt");

UPDATE "MobilePushDevice"
SET "smsPrimary" = true
WHERE "id" = (
  SELECT "id"
  FROM "MobilePushDevice"
  WHERE "enabled" = true
  ORDER BY "lastSeenAt" DESC
  LIMIT 1
);
