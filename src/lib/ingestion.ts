import { Prisma } from "@/generated/prisma/client";
import { fetchKalshiRecords } from "@/integrations/kalshi";
import { fetchManifoldRecords } from "@/integrations/manifold";
import { fetchPolymarketRecords } from "@/integrations/polymarket";
import { deterministicCanonicalEventId, resolveCanonicalEvent } from "@/lib/canonical";
import { prisma } from "@/lib/db";
import { Market } from "@/lib/market-types";

const json = (value: unknown) => value as Prisma.InputJsonValue;

export type SourceBatch = {
  source: string;
  retrievedAt: Date;
  records: Array<{
    raw: unknown;
    market: Market;
    rawPayloadHash: string;
    sourceTimestamp: Date | null;
  }>;
};

export type SourceFetcher = (limit: number) => Promise<SourceBatch>;
export type IngestionSourceConfig = {
  source: string;
  protocolName: string;
  normalizationVersion: string;
  fetchRecords: SourceFetcher;
};

function probability(prices: number[]) {
  const first = prices.at(0);
  return typeof first === "number" && Number.isFinite(first) ? first : null;
}

export const canonicalEventId = deterministicCanonicalEventId;

export async function ingestSource(config: IngestionSourceConfig, limit = 25) {
  const attempt = new Date();
  await prisma.dataSourceState.upsert({
    where: { source: config.source },
    update: { lastAttemptAt: attempt },
    create: { source: config.source, lastAttemptAt: attempt, freshness: "UNKNOWN" },
  });

  try {
    const batch = await config.fetchRecords(limit);
    let snapshotsCreated = 0;
    let provenanceCreated = 0;
    let canonicalAutoLinks = 0;
    let canonicalReviewCandidates = 0;

    for (const record of batch.records) {
      const canonical = await resolveCanonicalEvent(record.market.title, record.market.description, config.protocolName);
      const eventId = canonical.eventId;
      if (canonical.mode === "AUTO_LINK") canonicalAutoLinks += 1;
      if (canonical.mode === "REVIEW_CANDIDATE") canonicalReviewCandidates += 1;

      const stored = await prisma.market.upsert({
        where: { protocolName_externalId: { protocolName: config.protocolName, externalId: record.market.externalId } },
        update: {
          title: record.market.title,
          description: record.market.description || null,
          outcomes: json(record.market.outcomes),
          status: record.market.status,
          prices: json(record.market.prices),
          liquidity: record.market.liquidity,
          volume: record.market.volume,
          resolutionSource: record.market.resolutionSource === "UNAVAILABLE" ? null : record.market.resolutionSource,
          freshness: "FRESH",
          sourceTimestamp: record.sourceTimestamp,
          lastIngestedAt: batch.retrievedAt,
          canonicalEventId: eventId,
        },
        create: {
          externalId: record.market.externalId,
          protocolName: config.protocolName,
          title: record.market.title,
          description: record.market.description || null,
          outcomes: json(record.market.outcomes),
          status: record.market.status,
          prices: json(record.market.prices),
          liquidity: record.market.liquidity,
          volume: record.market.volume,
          resolutionSource: record.market.resolutionSource === "UNAVAILABLE" ? null : record.market.resolutionSource,
          freshness: "FRESH",
          sourceTimestamp: record.sourceTimestamp,
          lastIngestedAt: batch.retrievedAt,
          canonicalEventId: eventId,
        },
      });

      const existing = await prisma.dataProvenance.findUnique({
        where: { marketId_rawPayloadHash: { marketId: stored.id, rawPayloadHash: record.rawPayloadHash } },
      });
      if (!existing) {
        await prisma.$transaction([
          prisma.dataProvenance.create({
            data: {
              marketId: stored.id,
              source: config.source,
              externalMarketId: record.market.externalId,
              retrievedAt: batch.retrievedAt,
              sourceTimestamp: record.sourceTimestamp,
              rawPayloadHash: record.rawPayloadHash,
              normalizationVersion: config.normalizationVersion,
            },
          }),
          prisma.marketSnapshot.create({
            data: {
              marketId: stored.id,
              timestamp: batch.retrievedAt,
              sourceTimestamp: record.sourceTimestamp,
              probability: probability(record.market.prices),
              outcomePrices: json(record.market.prices),
              liquidity: record.market.liquidity,
              volume: record.market.volume,
              freshness: "FRESH",
              rawPayloadHash: record.rawPayloadHash,
            },
          }),
        ]);
        snapshotsCreated += 1;
        provenanceCreated += 1;
      }
    }

    await prisma.dataSourceState.update({
      where: { source: config.source },
      data: {
        freshness: "FRESH",
        lastSuccessAt: batch.retrievedAt,
        lastError: null,
        consecutiveFailures: 0,
      },
    });

    return {
      source: config.source,
      protocolName: config.protocolName,
      retrievedAt: batch.retrievedAt.toISOString(),
      marketsProcessed: batch.records.length,
      snapshotsCreated,
      provenanceCreated,
      canonicalAutoLinks,
      canonicalReviewCandidates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion failure";
    const current = await prisma.dataSourceState.findUnique({ where: { source: config.source } });
    await prisma.dataSourceState.update({
      where: { source: config.source },
      data: {
        lastError: message.slice(0, 1000),
        consecutiveFailures: (current?.consecutiveFailures ?? 0) + 1,
      },
    });
    throw error;
  }
}

export function ingestPolymarket(limit = 25, fetchRecords: SourceFetcher = fetchPolymarketRecords) {
  return ingestSource({ source: "polymarket-gamma", protocolName: "Polymarket", normalizationVersion: "polymarket-v1", fetchRecords }, limit);
}

export function ingestManifold(limit = 25, fetchRecords: SourceFetcher = fetchManifoldRecords) {
  return ingestSource({ source: "manifold-v0", protocolName: "Manifold", normalizationVersion: "manifold-v1", fetchRecords }, limit);
}

export function ingestKalshi(limit = 25, fetchRecords: SourceFetcher = fetchKalshiRecords) {
  return ingestSource({ source: "kalshi-public-rest", protocolName: "Kalshi", normalizationVersion: "kalshi-v1", fetchRecords }, limit);
}
