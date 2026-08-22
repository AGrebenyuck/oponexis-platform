ALTER TABLE "Customer"
  ADD COLUMN "privacyPolicyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyPolicyVersion" TEXT,
  ADD COLUMN "marketingSmsConsentAt" TIMESTAMP(3),
  ADD COLUMN "marketingSmsVersion" TEXT,
  ADD COLUMN "marketingSmsRevokedAt" TIMESTAMP(3);

CREATE TABLE "CustomerConsent" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "customerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  CONSTRAINT "CustomerConsent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerConsent"
  ADD CONSTRAINT "CustomerConsent_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CustomerConsent_customerId_type_createdAt_idx" ON "CustomerConsent"("customerId", "type", "createdAt");
CREATE INDEX "CustomerConsent_type_action_createdAt_idx" ON "CustomerConsent"("type", "action", "createdAt");
