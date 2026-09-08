CREATE TABLE "AddressGeocode" (
    "addressKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "attemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressGeocode_pkey" PRIMARY KEY ("addressKey")
);

CREATE TABLE "GeocodingMonthlyUsage" (
    "month" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeocodingMonthlyUsage_pkey" PRIMARY KEY ("month")
);

CREATE INDEX "AddressGeocode_status_idx" ON "AddressGeocode"("status");
