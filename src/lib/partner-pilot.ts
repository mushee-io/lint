import crypto from "node:crypto";
import { createApiKey } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setTenantPolicy } from "@/lib/enterprise";
import { ingestSource } from "@/lib/ingestion";
import type { Market, MarketStatus, Score } from "@/lib/market-types";
import { recordWatchBaseline } from "@/lib/watch-engine";

const ACTIVE_PILOT_STATUSES = ["INTEGRATING", "LIVE_TEST", "PILOT_ACTIVE", "REVIEW", "PRODUCTION_READY"] as const;
const PARTNER_KEY_PERMISSIONS = [
  "guard:write",
  "watch:read",
  "watch:write",
  "signals:read",
  "incidents:read",
  "incidents:write",
  "feedback:read",
  "feedback:write",
  "pilots:read",
  "webhooks:read",
  "webhooks:write",
  "partner:ingest",
  "intelligence:review",
] as const;

const ZERO_SCORE: Score = {
  overall: 0,
  clarity: 0,
  resolutionQuality: 0,
  outcomeCompleteness: 0,
  duplicateRisk: 0,
  manipulationRisk: 0,
  sourceReliability: 0,
  timeDefinition: 0,
  settlementAmbiguity: 0,
};

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function status(value: unknown): MarketStatus {
  return value === "CLOSED" || value === "RESOLVED" ? value : "OPEN";
}

function probabilityArray(input: Record<string, unknown>) {
  if (Array.isArray(input.prices)) {
    const values = input.prices.map((value) => Number(value)).filter(Number.isFinite);
    if (values.length) return values;
  }
  const probability = finiteNumber(input.probability, Number.NaN);
  if (Number.isFinite(probability) && probability >= 0 && probability <= 1) return [probability, 1 - probability];
  return [];
}

function partnerMarket(raw: Record<string, unknown>, protocolName: string): Market {
  const externalId = optionalString(raw.externalId || raw.id);
  const title = optionalString(raw.title);
  if (!externalId || !title) throw new Error("Every partner market requires externalId and title");
  const outcomes = Array.isArray(raw.outcomes) ? raw.outcomes.map(String).map((value) => value.trim()).filter(Boolean) : ["YES", "NO"];
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 50) : [];
  return {
    id: externalId,
    externalId,
    protocol: protocolName,
    chain: optionalString(raw.chain, "Partner"),
    title,
    description: optionalString(raw.description),
    outcomes: outcomes.length ? outcomes : ["YES", "NO"],
    category: optionalString(raw.category, "UNSPECIFIED"),
    tags,
    createdAt: optionalString(raw.createdAt, new Date().toISOString()),
    closeTime: optionalString(raw.closeTime),
    resolutionTime: optionalString(raw.resolutionTime),
    resolutionSource: optionalString(raw.resolutionSource, "UNAVAILABLE"),
    status: status(raw.status),
    marketUrl: optionalString(raw.marketUrl),
    creator: optionalString(raw.creator),
    liquidity: Math.max(0, finiteNumber(raw.liquidity)),
    volume: Math.max(0, finiteNumber(raw.volume)),
    prices: probabilityArray(raw),
    canonicalEventId: "",
    score: ZERO_SCORE,
  };
}

function rawHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function recordPilotMetricForOrganization(input: {
  organizationId: string;
  key: string;
  value: number;
  unit: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const pilot = await prisma.pilot.findFirst({
      where: { organizationId: input.organizationId, status: { in: [...ACTIVE_PILOT_STATUSES] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (!pilot) return null;
    return await prisma.pilotMetric.create({
      data: { pilotId: pilot.id, key: input.key, value: input.value, unit: input.unit, metadata: input.metadata },
    });
  } catch {
    return null;
  }
}

export async function activatePartnerPilot(input: { pilotId: string; organizationId: string; actorId?: string | null }) {
  const pilot = await prisma.pilot.findFirst({
    where: { id: input.pilotId, organizationId: input.organizationId },
    include: { protocol: true, organization: true },
  });
  if (!pilot) return null;

  await prisma.pilot.update({
    where: { id: pilot.id },
    data: { status: pilot.status === "PRODUCTION_READY" ? "PRODUCTION_READY" : "PILOT_ACTIVE", startedAt: pilot.startedAt ?? new Date() },
  });
  await setTenantPolicy({ organizationId: pilot.organizationId, plan: "PILOT", status: "ACTIVE", actorId: input.actorId });

  const existing = await prisma.apiKey.findFirst({
    where: { organizationId: pilot.organizationId, protocolId: pilot.protocolId, environment: "live", revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  let liveKey: { id: string; prefix: string; secret?: string; created: boolean };
  if (existing) {
    liveKey = { id: existing.id, prefix: existing.prefix, created: false };
  } else {
    const created = await createApiKey({
      organizationId: pilot.organizationId,
      protocolId: pilot.protocolId,
      environment: "live",
      label: `${pilot.protocol.name} partner pilot`,
      permissions: [...PARTNER_KEY_PERMISSIONS],
      actorId: input.actorId ?? undefined,
    });
    liveKey = { id: created.key.id, prefix: created.key.prefix, secret: created.secret, created: true };
  }

  await prisma.auditLog.create({
    data: {
      organizationId: pilot.organizationId,
      actorType: "SYSTEM",
      actorId: input.actorId ?? null,
      action: "PARTNER_PILOT_ACTIVATED",
      resourceType: "Pilot",
      resourceId: pilot.id,
      metadata: { protocolId: pilot.protocolId, protocol: pilot.protocol.name, liveKeyPrefix: liveKey.prefix, keyCreated: liveKey.created },
    },
  });

  return {
    pilot: { id: pilot.id, name: pilot.name, protocol: pilot.protocol.name, status: "PILOT_ACTIVE" },
    liveKey,
    permissions: PARTNER_KEY_PERMISSIONS,
    feedEndpoint: "/api/v1/partner/markets",
    guardEndpoint: "/api/v1/guard",
    watchEndpoint: "/api/v1/watch",
    feedbackEndpoint: "/api/v1/feedback",
    note: liveKey.created ? "The live API secret is returned once. Store it securely." : "A live key already exists. Rotate it if the partner needs a new secret.",
  };
}

export async function ingestPartnerMarkets(input: {
  organizationId: string;
  protocolId: string;
  actorId: string;
  markets: Record<string, unknown>[];
  autoWatch?: boolean;
}) {
  const startedAt = Date.now();
  const protocol = await prisma.protocol.findFirst({ where: { id: input.protocolId, organizationId: input.organizationId } });
  if (!protocol) throw new Error("Protocol not found in this organization");
  if (!input.markets.length) throw new Error("At least one market is required");
  if (input.markets.length > 500) throw new Error("A partner feed batch can contain at most 500 markets");

  const retrievedAt = new Date();
  const records = input.markets.map((raw) => {
    const market = partnerMarket(raw, protocol.name);
    const sourceTimestampRaw = optionalString(raw.updatedAt || raw.sourceTimestamp);
    const sourceTimestamp = sourceTimestampRaw && !Number.isNaN(Date.parse(sourceTimestampRaw)) ? new Date(sourceTimestampRaw) : retrievedAt;
    return { raw, market, rawPayloadHash: rawHash(raw), sourceTimestamp };
  });
  const source = `partner-${protocol.id}`;
  const ingestion = await ingestSource({
    source,
    protocolName: protocol.name,
    normalizationVersion: "partner-feed-v1",
    fetchRecords: async () => ({ source, retrievedAt, records }),
  }, records.length);

  const stored = await prisma.market.findMany({
    where: { protocolName: protocol.name, externalId: { in: records.map((record) => record.market.externalId) } },
    select: { id: true, externalId: true, resolutionSource: true, status: true },
  });

  let watchesActivated = 0;
  if (input.autoWatch !== false) {
    for (const market of stored) {
      const existing = await prisma.watchRegistration.findUnique({ where: { organizationId_marketId: { organizationId: input.organizationId, marketId: market.id } } });
      const watch = await prisma.watchRegistration.upsert({
        where: { organizationId_marketId: { organizationId: input.organizationId, marketId: market.id } },
        update: { active: true, protocolId: protocol.id },
        create: { organizationId: input.organizationId, protocolId: protocol.id, marketId: market.id, active: true },
      });
      if (!existing) {
        await recordWatchBaseline({ organizationId: input.organizationId, watchId: watch.id, marketId: market.id, resolutionSource: market.resolutionSource, marketStatus: market.status, actorType: "API_KEY", actorId: input.actorId });
      }
      watchesActivated += 1;
    }
  }

  const elapsed = Date.now() - startedAt;
  await Promise.all([
    recordPilotMetricForOrganization({ organizationId: input.organizationId, key: "partner.markets_ingested", value: stored.length, unit: "markets", metadata: { protocol: protocol.name, source } }),
    recordPilotMetricForOrganization({ organizationId: input.organizationId, key: "partner.ingest_response_ms", value: elapsed, unit: "ms", metadata: { protocol: protocol.name, batchSize: stored.length } }),
  ]);

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorType: "API_KEY",
      actorId: input.actorId,
      action: "PARTNER_FEED_INGESTED",
      resourceType: "Protocol",
      resourceId: protocol.id,
      metadata: { source, marketsProcessed: ingestion.marketsProcessed, snapshotsCreated: ingestion.snapshotsCreated, watchesActivated, responseTimeMs: elapsed },
    },
  });

  return { ...ingestion, source, watchesActivated, responseTimeMs: elapsed, marketIds: stored.map((market) => ({ id: market.id, externalId: market.externalId })) };
}

export async function getPartnerPilotStatus(pilotId: string, organizationId: string) {
  const pilot = await prisma.pilot.findFirst({ where: { id: pilotId, organizationId }, include: { protocol: true } });
  if (!pilot) return null;
  const source = `partner-${pilot.protocolId}`;
  const [liveKeys, webhooks, watches, sourceState, feedback, reports, recentMetrics] = await Promise.all([
    prisma.apiKey.count({ where: { organizationId, protocolId: pilot.protocolId, environment: "live", revokedAt: null } }),
    prisma.webhookEndpoint.count({ where: { organizationId, active: true } }),
    prisma.watchRegistration.count({ where: { organizationId, protocolId: pilot.protocolId, active: true } }),
    prisma.dataSourceState.findUnique({ where: { source } }),
    prisma.feedback.count({ where: { organizationId, createdAt: { gte: pilot.startedAt ?? pilot.createdAt } } }),
    prisma.pilotReport.count({ where: { pilotId } }),
    prisma.pilotMetric.findMany({ where: { pilotId }, orderBy: { recordedAt: "desc" }, take: 20 }),
  ]);
  const checklist = [
    { key: "PILOT_ACTIVE", pass: ["PILOT_ACTIVE", "REVIEW", "PRODUCTION_READY"].includes(pilot.status), detail: pilot.status },
    { key: "LIVE_API_KEY", pass: liveKeys > 0, detail: `${liveKeys} live key(s)` },
    { key: "PARTNER_FEED", pass: sourceState?.lastSuccessAt != null && sourceState.consecutiveFailures === 0, detail: sourceState?.lastSuccessAt?.toISOString() ?? "No feed received" },
    { key: "WATCH_ACTIVE", pass: watches > 0, detail: `${watches} watched market(s)` },
    { key: "WEBHOOK", pass: webhooks > 0, detail: `${webhooks} active endpoint(s)` },
    { key: "FEEDBACK", pass: feedback > 0, detail: `${feedback} feedback item(s)` },
    { key: "PILOT_REPORT", pass: reports > 0, detail: `${reports} report(s)` },
  ];
  return {
    pilot: { id: pilot.id, name: pilot.name, status: pilot.status, protocol: pilot.protocol.name, startedAt: pilot.startedAt?.toISOString() ?? null },
    source: sourceState ? { source, freshness: sourceState.freshness, lastSuccessAt: sourceState.lastSuccessAt?.toISOString() ?? null, consecutiveFailures: sourceState.consecutiveFailures, lastError: sourceState.lastError } : { source, freshness: "UNKNOWN", lastSuccessAt: null, consecutiveFailures: 0, lastError: null },
    checklist,
    readyForMeasuredPilot: checklist.filter((item) => item.key !== "FEEDBACK" && item.key !== "PILOT_REPORT").every((item) => item.pass),
    recentMetrics,
  };
}
