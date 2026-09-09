import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { CONSENSUS_ALGORITHM_VERSION, getConsensusIntelligence, getProtocolReliability, refreshGraphConsensus } from "@/lib/consensus-engine";
import { GET as getConsensus } from "@/app/api/v1/events/[id]/consensus/route";
import { GET as getDivergence } from "@/app/api/v1/events/[id]/divergence/route";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Consensus v3 smoke must not run against production");
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const organization = await prisma.organization.create({ data: { name: `Consensus V3 ${suffix}`, slug: `consensus-v3-${suffix}` } });
  const event = await prisma.canonicalEvent.create({ data: { title: `Will consensus-v3-${suffix} resolve YES?`, description: "Synthetic CI event for consensus confidence." } });
  const protocolAName = `VenueA-${suffix}`;
  const protocolBName = `VenueB-${suffix}`;
  const sourceA = `venue-a-source-${suffix}`;
  const sourceB = `venue-b-source-${suffix}`;
  const protocolA = await prisma.protocol.create({ data: { organizationId: organization.id, name: protocolAName, sourceName: sourceA, status: "LIVE_TEST" } });
  const protocolB = await prisma.protocol.create({ data: { organizationId: organization.id, name: protocolBName, sourceName: sourceB, status: "LIVE_TEST" } });

  const marketA = await prisma.market.create({ data: {
    externalId: `a-${suffix}`,
    protocolName: protocolAName,
    title: event.title,
    outcomes: ["YES", "NO"],
    status: "OPEN",
    prices: [0.78, 0.22],
    liquidity: 10_000,
    volume: 25_000,
    resolutionSource: "https://example.com/a",
    freshness: "FRESH",
    canonicalEventId: event.id,
    lastIngestedAt: new Date(),
  } });
  const marketB = await prisma.market.create({ data: {
    externalId: `b-${suffix}`,
    protocolName: protocolBName,
    title: event.title,
    outcomes: ["YES", "NO"],
    status: "OPEN",
    prices: [0.42, 0.58],
    liquidity: 100,
    volume: 1_000,
    resolutionSource: "https://example.com/b",
    freshness: "FRESH",
    canonicalEventId: event.id,
    lastIngestedAt: new Date(),
  } });

  const started = Date.now() - 6 * 60_000;
  for (let index = 0; index < 6; index += 1) {
    await prisma.marketSnapshot.create({ data: { marketId: marketA.id, timestamp: new Date(started + index * 60_000), probability: 0.73 + index * 0.01, liquidity: 10_000, volume: 20_000 + index * 1_000, freshness: "FRESH" } });
    await prisma.marketSnapshot.create({ data: { marketId: marketB.id, timestamp: new Date(started + index * 60_000), probability: 0.47 - index * 0.01, liquidity: 100, volume: 500 + index * 100, freshness: "FRESH" } });
  }

  await prisma.dataSourceState.createMany({ data: [
    { source: sourceA, freshness: "FRESH", lastAttemptAt: new Date(), lastSuccessAt: new Date(), consecutiveFailures: 0 },
    { source: sourceB, freshness: "FRESH", lastAttemptAt: new Date(), lastSuccessAt: new Date(), consecutiveFailures: 0 },
  ] });
  await prisma.dataProvenance.createMany({ data: [
    { marketId: marketA.id, source: sourceA, externalMarketId: marketA.externalId, retrievedAt: new Date(), rawPayloadHash: `hash-a-${suffix}`, normalizationVersion: "consensus-v3-ci" },
    { marketId: marketB.id, source: sourceB, externalMarketId: marketB.externalId, retrievedAt: new Date(), rawPayloadHash: `hash-b-${suffix}`, normalizationVersion: "consensus-v3-ci" },
  ] });
  await prisma.watchRegistration.create({ data: { organizationId: organization.id, protocolId: protocolA.id, marketId: marketA.id } });

  try {
    const first = await refreshGraphConsensus();
    assert.equal(first.algorithmVersion, CONSENSUS_ALGORITHM_VERSION);
    assert(first.divergenceAlertsCreated >= 1, "Expected a cross-protocol divergence alert");

    const latest = await prisma.consensusSnapshot.findFirst({ where: { canonicalEventId: event.id }, orderBy: { createdAt: "desc" } });
    assert(latest, "Consensus snapshot was not persisted");
    assert.equal(latest.status, "READY");
    assert.equal(latest.protocolCount, 2);
    assert.equal(latest.algorithmVersion, CONSENSUS_ALGORITHM_VERSION);
    assert(latest.probability != null && latest.probability > 0.50 && latest.probability < 0.70, `Venue-balanced probability was unexpectedly dominated: ${latest.probability}`);
    assert(latest.eventConfidenceScore != null && latest.eventConfidenceScore > 0 && latest.eventConfidenceScore <= 100);
    assert(latest.dispersion != null && latest.dispersion >= 0.30);

    const intelligence = await getConsensusIntelligence(event.id);
    assert(intelligence);
    assert.equal(intelligence.latest.status, "READY");
    assert(Array.isArray(intelligence.divergences));
    assert((intelligence.divergences as Array<{ severity: string }>).some((item) => item.severity === "CRITICAL"));
    const decomposition = intelligence.confidenceDecomposition as { agreement?: number; sourceReliability?: number; freshness?: number; total?: number };
    assert(typeof decomposition.total === "number");
    assert(typeof decomposition.agreement === "number");
    assert(typeof decomposition.sourceReliability === "number");
    assert(typeof decomposition.freshness === "number");

    const alert = await prisma.riskSignal.findFirst({ where: { organizationId: organization.id, eventId: event.id, type: "CONSENSUS_DIVERGENCE" } });
    assert(alert, "No durable CONSENSUS_DIVERGENCE signal was created");
    assert.equal(alert.algorithmVersion, CONSENSUS_ALGORITHM_VERSION);
    assert.equal(alert.severity, "CRITICAL");

    const second = await refreshGraphConsensus();
    assert.equal(second.divergenceAlertsCreated, 0, "Unchanged divergence should not create another escalation alert");
    assert.equal(await prisma.riskSignal.count({ where: { organizationId: organization.id, eventId: event.id, type: "CONSENSUS_DIVERGENCE" } }), 1);

    const reliabilityA = await getProtocolReliability(protocolAName);
    assert(reliabilityA && reliabilityA.score > 50);
    assert.equal(reliabilityA.staleOrUnknownMarkets, 0);

    const consensusResponse = await getConsensus(new Request(`http://localhost/api/v1/events/${event.id}/consensus`), { params: Promise.resolve({ id: event.id }) });
    assert.equal(consensusResponse.status, 200);
    const consensusPayload = await consensusResponse.json() as { data: { latest: { status: string }; confidenceDecomposition: unknown } };
    assert.equal(consensusPayload.data.latest.status, "READY");
    assert(consensusPayload.data.confidenceDecomposition);

    const divergenceResponse = await getDivergence(new Request(`http://localhost/api/v1/events/${event.id}/divergence`), { params: Promise.resolve({ id: event.id }) });
    assert.equal(divergenceResponse.status, 200);
    const divergencePayload = await divergenceResponse.json() as { data: { divergences: Array<{ severity: string }> } };
    assert(divergencePayload.data.divergences.some((item) => item.severity === "CRITICAL"));

    console.log(JSON.stringify({
      status: "PASS",
      algorithmVersion: CONSENSUS_ALGORITHM_VERSION,
      probability: latest.probability,
      confidenceScore: latest.eventConfidenceScore,
      dispersion: latest.dispersion,
      divergenceAlert: alert.severity,
      reliabilityScore: reliabilityA.score,
      deduplication: "PASS",
      APIs: "PASS",
    }, null, 2));
  } finally {
    await prisma.riskSignal.deleteMany({ where: { organizationId: organization.id } });
    await prisma.watchRegistration.deleteMany({ where: { organizationId: organization.id } });
    await prisma.protocol.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.dataSourceState.deleteMany({ where: { source: { in: [sourceA, sourceB] } } });
    await prisma.market.deleteMany({ where: { id: { in: [marketA.id, marketB.id] } } });
    await prisma.canonicalEvent.delete({ where: { id: event.id } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
