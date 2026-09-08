-- Initial Market Lint schema for Prisma 7 / PostgreSQL
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'ANALYST', 'VIEWER');
CREATE TYPE "FreshnessStatus" AS ENUM ('FRESH', 'AGING', 'STALE', 'UNKNOWN');
CREATE TYPE "PilotStatus" AS ENUM ('INVITED', 'SANDBOX', 'INTEGRATING', 'LIVE_TEST', 'PILOT_ACTIVE', 'REVIEW', 'PRODUCTION_READY', 'ENDED');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMembership" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL,
  CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Protocol" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "Protocol_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiKey" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "permissions" TEXT[],
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "revokedAt" TIMESTAMP(3),
  "protocolId" TEXT,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CanonicalEvent" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "CanonicalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Market" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "protocolName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "outcomes" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "prices" JSONB,
  "liquidity" DOUBLE PRECISION,
  "volume" DOUBLE PRECISION,
  "resolutionSource" TEXT,
  "freshness" "FreshnessStatus" NOT NULL DEFAULT 'UNKNOWN',
  "canonicalEventId" TEXT,
  CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketSnapshot" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "probability" DOUBLE PRECISION,
  "outcomePrices" JSONB,
  "liquidity" DOUBLE PRECISION,
  "volume" DOUBLE PRECISION,
  CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataProvenance" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalMarketId" TEXT NOT NULL,
  "retrievedAt" TIMESTAMP(3) NOT NULL,
  "rawPayloadHash" TEXT NOT NULL,
  "normalizationVersion" TEXT NOT NULL,
  CONSTRAINT "DataProvenance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventRelationship" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "targetEventId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventRelationship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WatchRegistration" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  CONSTRAINT "WatchRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pilot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "status" "PilotStatus" NOT NULL DEFAULT 'INVITED',
  CONSTRAINT "Pilot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Feedback" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "comment" TEXT,
  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");
CREATE UNIQUE INDEX "Protocol_organizationId_name_key" ON "Protocol"("organizationId", "name");
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE UNIQUE INDEX "Market_protocolName_externalId_key" ON "Market"("protocolName", "externalId");
CREATE INDEX "MarketSnapshot_marketId_timestamp_idx" ON "MarketSnapshot"("marketId", "timestamp");
CREATE UNIQUE INDEX "WatchRegistration_organizationId_marketId_key" ON "WatchRegistration"("organizationId", "marketId");

ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Protocol" ADD CONSTRAINT "Protocol_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Market" ADD CONSTRAINT "Market_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "CanonicalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataProvenance" ADD CONSTRAINT "DataProvenance_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchRegistration" ADD CONSTRAINT "WatchRegistration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchRegistration" ADD CONSTRAINT "WatchRegistration_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchRegistration" ADD CONSTRAINT "WatchRegistration_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pilot" ADD CONSTRAINT "Pilot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pilot" ADD CONSTRAINT "Pilot_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
