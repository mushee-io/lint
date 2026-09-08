import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { fetchPolymarketRecords } from "@/integrations/polymarket";

const NORMALIZATION_VERSION = "polymarket-v1";
const json = (value: unknown) => value as Prisma.InputJsonValue;

function probability(prices: number[]) {
  const first = prices.at(0);
  return typeof first === "number" && Number.isFinite(first) ? first : null;
}

function canonicalEventId(title: string) {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `ce_${crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
}

export async function ingestPolymarket(limit = 25) {
  const source = "polymarket-gamma";
  const attempt = new Date();
  await prisma.dataSourceState.upsert({
    where: { source },
    update: { lastAttemptAt: attempt },
    create: { source, lastAttemptAt: attempt, freshness: "UNKNOWN" },
  });

  try {
    const batch = await fetchPolymarketRecords(limit);
    let snapshotsCreated = 0;
    let provenanceCreated = 0;

    for (const record of batch.records) {
      const eventId = canonicalEventId(record.market.title);
      await prisma.canonicalEvent.upsert({
        where: { id: eventId },
        update: { title: record.market.title },
        create: { id: eventId, title: record.market.title, description: record.market.description || null },
      });

      const stored = await prisma.market.upsert({
        where: { protocolName_externalId: { protocolName: "Polymarket", externalId: record.market.externalId } },
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
          protocolName: "Polymarket",
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
              source,
              externalMarketId: record.market.externalId,
              retrievedAt: batch.retrievedAt,
              sourceTimestamp: record.sourceTimestamp,
              rawPayloadHash: record.rawPayloadHash,
              normalizationVersion: NORMALIZATION_VERSION,
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
      where: { source },
      data: {
        freshness: "FRESH",
        lastSuccessAt: batch.retrievedAt,
        lastError: null,
        consecutiveFailures: 0,
      },
    });

    return {
      source,
      retrievedAt: batch.retrievedAt.toISOString(),
      marketsProcessed: batch.records.length,
      snapshotsCreated,
      provenanceCreated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion failure";
    const current = await prisma.dataSourceState.findUnique({ where: { source } });
    await prisma.dataSourceState.update({
      where: { source },
      data: {
        lastError: message.slice(0, 1000),
        consecutiveFailures: (current?.consecutiveFailures ?? 0) + 1,
      },
    });
    throw error;
  }
}
