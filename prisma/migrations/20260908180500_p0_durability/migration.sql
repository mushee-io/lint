-- Market Lint P0 durable infrastructure expansion.
-- This migration is additive to 20260908175100_init_market_lint.

CREATE TYPE "GuardDecision" AS ENUM ('ALLOW', 'REVIEW', 'BLOCK');
CREATE TYPE "SignalSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ConsensusStatus" AS ENUM ('READY', 'INSUFFICIENT_DATA', 'STALE');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'RETRYING', 'DELIVERED', 'DEAD_LETTER');
CREATE TYPE "WorkerJobStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRY', 'SUCCEEDED', 'DEAD_LETTER');
CREATE TYPE "FeedbackLabel" AS ENUM ('USEFUL', 'EXPECTED', 'FALSE_POSITIVE', 'FALSE_NEGATIVE', 'AGREE', 'DISAGREE', 'UNCERTAIN');

ALTER TABLE "Organization" ADD COLUMN "slug" TEXT;
UPDATE "Organization" SET "slug" = "id" WHERE "slug" IS NULL;
ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Organization" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Organization" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "Organization" ALTER COLUMN "updatedAt" SET NOT NULL;
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "OrganizationMembership" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");

ALTER TABLE "Protocol" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Protocol" ADD COLUMN "sourceName" TEXT;
ALTER TABLE "Protocol" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE "Protocol" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Protocol" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Protocol" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "Protocol" ALTER COLUMN "updatedAt" SET NOT NULL;
CREATE INDEX "Protocol_organizationId_idx" ON "Protocol"("organizationId");

ALTER TABLE "ApiKey" ADD COLUMN "label" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "ApiKey" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey"("hash");
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");
CREATE INDEX "ApiKey_protocolId_idx" ON "ApiKey"("protocolId");

ALTER TABLE "CanonicalEvent" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CanonicalEvent" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "CanonicalEvent" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "CanonicalEvent" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Market" ADD COLUMN "sourceTimestamp" TIMESTAMP(3);
ALTER TABLE "Market" ADD COLUMN "lastIngestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Market" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Market" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Market" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "Market" ALTER COLUMN "updatedAt" SET NOT NULL;
CREATE INDEX "Market_canonicalEventId_idx" ON "Market"("canonicalEventId");
CREATE INDEX "Market_freshness_idx" ON "Market"("freshness");
CREATE INDEX "Market_lastIngestedAt_idx" ON "Market"("lastIngestedAt");

ALTER TABLE "MarketSnapshot" ADD COLUMN "sourceTimestamp" TIMESTAMP(3);
ALTER TABLE "MarketSnapshot" ADD COLUMN "freshness" "FreshnessStatus" NOT NULL DEFAULT 'FRESH';
ALTER TABLE "MarketSnapshot" ADD COLUMN "rawPayloadHash" TEXT;

ALTER TABLE "DataProvenance" ADD COLUMN "sourceTimestamp" TIMESTAMP(3);
CREATE UNIQUE INDEX "DataProvenance_marketId_rawPayloadHash_key" ON "DataProvenance"("marketId", "rawPayloadHash");
CREATE INDEX "DataProvenance_source_retrievedAt_idx" ON "DataProvenance"("source", "retrievedAt");
CREATE INDEX "EventRelationship_sourceEventId_idx" ON "EventRelationship"("sourceEventId");
CREATE INDEX "EventRelationship_targetEventId_idx" ON "EventRelationship"("targetEventId");

ALTER TABLE "WatchRegistration" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WatchRegistration" ADD COLUMN "lastEvaluatedAt" TIMESTAMP(3);
ALTER TABLE "WatchRegistration" ADD COLUMN "lastSnapshotId" TEXT;
ALTER TABLE "WatchRegistration" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WatchRegistration" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "WatchRegistration" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "WatchRegistration" ALTER COLUMN "updatedAt" SET NOT NULL;
CREATE INDEX "WatchRegistration_protocolId_idx" ON "WatchRegistration"("protocolId");
CREATE INDEX "WatchRegistration_active_idx" ON "WatchRegistration"("active");

ALTER TABLE "Pilot" ADD COLUMN "name" TEXT;
ALTER TABLE "Pilot" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Pilot" ADD COLUMN "endedAt" TIMESTAMP(3);
ALTER TABLE "Pilot" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Pilot" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Pilot" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "Pilot" ALTER COLUMN "updatedAt" SET NOT NULL;
CREATE INDEX "Pilot_organizationId_status_idx" ON "Pilot"("organizationId", "status");

ALTER TABLE "Feedback" ADD COLUMN "algorithmVersion" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Feedback" ALTER COLUMN "label" TYPE "FeedbackLabel" USING (
  CASE
    WHEN "label" IN ('USEFUL','EXPECTED','FALSE_POSITIVE','FALSE_NEGATIVE','AGREE','DISAGREE','UNCERTAIN')
      THEN "label"::"FeedbackLabel"
    ELSE 'UNCERTAIN'::"FeedbackLabel"
  END
);
CREATE INDEX "Feedback_organizationId_targetType_targetId_idx" ON "Feedback"("organizationId", "targetType", "targetId");

CREATE TABLE "GuardEvaluation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "protocolId" TEXT,
  "marketId" TEXT,
  "decision" "GuardDecision" NOT NULL,
  "marketLintScore" INTEGER NOT NULL,
  "duplicateRisk" TEXT NOT NULL,
  "ambiguityRisk" TEXT NOT NULL,
  "resolutionRisk" TEXT NOT NULL,
  "manipulationRisk" TEXT NOT NULL,
  "warnings" JSONB,
  "reasons" JSONB,
  "evidence" JSONB,
  "algorithmVersion" TEXT NOT NULL DEFAULT 'guard-v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuardEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RiskSignal" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "watchId" TEXT,
  "marketId" TEXT,
  "eventId" TEXT,
  "type" TEXT NOT NULL,
  "severity" "SignalSeverity" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "explanation" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "recommendedAction" TEXT NOT NULL,
  "algorithmVersion" TEXT NOT NULL DEFAULT 'risk-v1',
  "dedupeKey" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiskSignal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsensusSnapshot" (
  "id" TEXT NOT NULL,
  "canonicalEventId" TEXT NOT NULL,
  "status" "ConsensusStatus" NOT NULL,
  "probability" DOUBLE PRECISION,
  "confidence" TEXT NOT NULL,
  "eventConfidenceScore" INTEGER,
  "marketCount" INTEGER NOT NULL,
  "protocolCount" INTEGER NOT NULL,
  "dispersion" DOUBLE PRECISION,
  "inputs" JSONB NOT NULL,
  "algorithmVersion" TEXT NOT NULL DEFAULT 'consensus-v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsensusSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataSourceState" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "freshness" "FreshnessStatus" NOT NULL DEFAULT 'UNKNOWN',
  "lastAttemptAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastError" TEXT,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "cursor" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataSourceState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEndpoint" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT,
  "secretCiphertext" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "signalId" TEXT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 6,
  "idempotencyKey" TEXT NOT NULL,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responseStatus" INTEGER,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotMetric" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "metadata" JSONB,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotReport" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "body" JSONB NOT NULL,
  "html" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerJob" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WorkerJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkerJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RiskSignal_dedupeKey_key" ON "RiskSignal"("dedupeKey");
CREATE UNIQUE INDEX "DataSourceState_source_key" ON "DataSourceState"("source");
CREATE UNIQUE INDEX "WebhookDelivery_idempotencyKey_key" ON "WebhookDelivery"("idempotencyKey");
CREATE UNIQUE INDEX "WorkerJob_idempotencyKey_key" ON "WorkerJob"("idempotencyKey");
CREATE INDEX "GuardEvaluation_organizationId_createdAt_idx" ON "GuardEvaluation"("organizationId", "createdAt");
CREATE INDEX "GuardEvaluation_marketId_createdAt_idx" ON "GuardEvaluation"("marketId", "createdAt");
CREATE INDEX "RiskSignal_organizationId_detectedAt_idx" ON "RiskSignal"("organizationId", "detectedAt");
CREATE INDEX "RiskSignal_marketId_detectedAt_idx" ON "RiskSignal"("marketId", "detectedAt");
CREATE INDEX "RiskSignal_eventId_detectedAt_idx" ON "RiskSignal"("eventId", "detectedAt");
CREATE INDEX "ConsensusSnapshot_canonicalEventId_createdAt_idx" ON "ConsensusSnapshot"("canonicalEventId", "createdAt");
CREATE INDEX "WebhookEndpoint_organizationId_active_idx" ON "WebhookEndpoint"("organizationId", "active");
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");
CREATE INDEX "PilotMetric_pilotId_recordedAt_idx" ON "PilotMetric"("pilotId", "recordedAt");
CREATE INDEX "PilotReport_pilotId_generatedAt_idx" ON "PilotReport"("pilotId", "generatedAt");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "WorkerJob_status_runAfter_idx" ON "WorkerJob"("status", "runAfter");

ALTER TABLE "GuardEvaluation" ADD CONSTRAINT "GuardEvaluation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuardEvaluation" ADD CONSTRAINT "GuardEvaluation_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuardEvaluation" ADD CONSTRAINT "GuardEvaluation_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RiskSignal" ADD CONSTRAINT "RiskSignal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RiskSignal" ADD CONSTRAINT "RiskSignal_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "WatchRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RiskSignal" ADD CONSTRAINT "RiskSignal_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsensusSnapshot" ADD CONSTRAINT "ConsensusSnapshot_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "CanonicalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "RiskSignal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PilotMetric" ADD CONSTRAINT "PilotMetric_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotReport" ADD CONSTRAINT "PilotReport_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
