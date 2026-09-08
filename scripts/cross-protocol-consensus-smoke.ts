import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Market } from "@/lib/market-types";
import { scoreMarket } from "@/lib/market-score";
import { ingestSource, SourceBatch } from "@/lib/ingestion";
import { refreshConsensus } from "@/lib/intelligence";
import { prisma } from "@/lib/db";

function fixtureMarket(input: { externalId: string; protocol: string; title: string; probability: number }): Market {
  const base = {
    id: `${input.protocol}-${input.externalId}`,
    externalId: input.externalId,
    protocol: input.protocol,
    chain: "Test",
    title: input.title,
    description: "Synthetic CI fixture used only to prove cross-protocol canonical grouping and consensus.",
    outcomes: ["YES", "NO"],
    category: "CI",
    tags: ["ci", "consensus"],
    createdAt: new Date().toISOString(),
    closeTime: new Date(Date.now() + 86_400_000).toISOString(),
    resolutionTime: new Date(Date.now() + 86_400_000).toISOString(),
    resolutionSource: "https://example.com/resolution",
    status: "OPEN" as const,
    marketUrl: "https://example.com/market",
    creator: "Market Lint CI",
    liquidity: 1000,
    volume: 5000,
    prices: [input.probability, 1 - input.probability],
    canonicalEventId: "unassigned",
  };
  return { ...base, score: scoreMarket(base) };
}

function batch(source: string, market: Market): SourceBatch {
  const raw = { source, externalId: market.externalId, title: market.title, prices: market.prices };
  return {
    source,
    retrievedAt: new Date(),
    records: [{
      raw,
      market,
      rawPayloadHash: crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
      sourceTimestamp: new Date(),
    }],
  };
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Consensus smoke must not run against production");
  const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const subject = `consensusproof${suffix}`;
  const sourceA = `consensus-a-${suffix}`;
  const sourceB = `consensus-b-${suffix}`;
  const protocolA = `ConsensusA-${suffix}`;
  const protocolB = `ConsensusB-${suffix}`;
  const marketA = fixtureMarket({ externalId: `a-${suffix}`, protocol: protocolA, title: `Will ${subject} win the 2028 protocol election?`, probability: 0.62 });
  const marketB = fixtureMarket({ externalId: `b-${suffix}`, protocol: protocolB, title: `${subject} to win protocol election in 2028`, probability: 0.58 });

  let eventId: string | null = null;
  try {
    await ingestSource({ source: sourceA, protocolName: protocolA, normalizationVersion: "ci-v1", fetchRecords: async () => batch(sourceA, marketA) }, 1);
    await ingestSource({ source: sourceB, protocolName: protocolB, normalizationVersion: "ci-v1", fetchRecords: async () => batch(sourceB, marketB) }, 1);

    const stored = await prisma.market.findMany({ where: { protocolName: { in: [protocolA, protocolB] } }, orderBy: { protocolName: "asc" } });
    assert.equal(stored.length, 2);
    assert(stored[0].canonicalEventId, "First market has no canonical event");
    assert.equal(stored[0].canonicalEventId, stored[1].canonicalEventId, "Equivalent cross-protocol markets did not share a canonical event");
    eventId = stored[0].canonicalEventId;

    await refreshConsensus();
    const consensus = await prisma.consensusSnapshot.findFirst({ where: { canonicalEventId: eventId! }, orderBy: { createdAt: "desc" } });
    assert(consensus, "No consensus snapshot was created");
    assert.equal(consensus.status, "READY");
    assert.equal(consensus.protocolCount, 2);
    assert.equal(consensus.marketCount, 2);
    assert(consensus.probability != null && consensus.probability > 0.58 && consensus.probability < 0.62);

    console.log(JSON.stringify({ status: "PASS", canonicalEventId: eventId, protocols: 2, markets: 2, consensusStatus: consensus.status, probability: consensus.probability }, null, 2));
  } finally {
    await prisma.market.deleteMany({ where: { protocolName: { in: [protocolA, protocolB] } } }).catch(() => undefined);
    await prisma.dataSourceState.deleteMany({ where: { source: { in: [sourceA, sourceB] } } }).catch(() => undefined);
    if (eventId) await prisma.canonicalEvent.delete({ where: { id: eventId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
