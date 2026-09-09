import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createApiKey } from "../src/lib/auth";
import { CONSENSUS_ALGORITHM_VERSION, refreshGraphConsensus } from "../src/lib/consensus-engine";
import { prisma } from "../src/lib/db";
import { getConfirmedEventClusterIds, getPersistentEventGraph } from "../src/lib/event-graph";
import { GET as listRelationships } from "../src/app/api/v1/event-relationships/route";
import { POST as decideRelationship } from "../src/app/api/v1/event-relationships/[id]/route";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Event graph smoke must not run against production");
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const organization = await prisma.organization.create({ data: { name: `Graph ${suffix}`, slug: `graph-${suffix}` } });
  const eventA = await prisma.canonicalEvent.create({ data: { id: `ce_graph_a_${suffix}`, title: `Will graphproof ${suffix} candidate win the 2028 election?` } });
  const eventB = await prisma.canonicalEvent.create({ data: { id: `ce_graph_b_${suffix}`, title: `Graphproof ${suffix} candidate to win election in 2028` } });
  const relationship = await prisma.eventRelationship.create({
    data: {
      id: `rel_graph_${suffix}`,
      sourceEventId: eventA.id,
      targetEventId: eventB.id,
      relationshipType: "POSSIBLE_SAME_EVENT",
      confidence: 0.79,
      reason: "Synthetic graph review candidate.",
    },
  });
  const marketA = await prisma.market.create({
    data: {
      externalId: `graph-a-${suffix}`,
      protocolName: `GraphProtocolA-${suffix}`,
      title: eventA.title,
      outcomes: ["YES", "NO"],
      status: "OPEN",
      prices: [0.62, 0.38],
      liquidity: 1000,
      volume: 5000,
      resolutionSource: "https://example.com/a",
      freshness: "FRESH",
      canonicalEventId: eventA.id,
      lastIngestedAt: new Date(),
    },
  });
  const marketB = await prisma.market.create({
    data: {
      externalId: `graph-b-${suffix}`,
      protocolName: `GraphProtocolB-${suffix}`,
      title: eventB.title,
      outcomes: ["YES", "NO"],
      status: "OPEN",
      prices: [0.58, 0.42],
      liquidity: 900,
      volume: 4500,
      resolutionSource: "https://example.com/b",
      freshness: "FRESH",
      canonicalEventId: eventB.id,
      lastIngestedAt: new Date(),
    },
  });
  await prisma.marketSnapshot.createMany({ data: [
    { marketId: marketA.id, timestamp: new Date(), probability: 0.62, liquidity: 1000, volume: 5000, freshness: "FRESH" },
    { marketId: marketB.id, timestamp: new Date(), probability: 0.58, liquidity: 900, volume: 4500, freshness: "FRESH" },
  ] });

  try {
    const before = await getPersistentEventGraph(eventA.id);
    assert(before);
    assert.equal(before.confirmedCluster.eventIds.length, 1);
    assert.equal(before.edges.find((edge) => edge.id === relationship.id)?.reviewRequired, true);

    const key = await createApiKey({ organizationId: organization.id, permissions: ["graph:read", "graph:write"], label: "event-graph-smoke" });
    const unauthorized = await listRelationships(new Request("http://localhost/api/v1/event-relationships"));
    assert.equal(unauthorized.status, 401);

    const queueResponse = await listRelationships(new Request("http://localhost/api/v1/event-relationships", { headers: { authorization: `Bearer ${key.secret}` } }));
    assert.equal(queueResponse.status, 200);
    const queuePayload = await queueResponse.json() as { data: Array<{ id: string }> };
    assert(queuePayload.data.some((item) => item.id === relationship.id));

    const decisionResponse = await decideRelationship(new Request(`http://localhost/api/v1/event-relationships/${relationship.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ decision: "CONFIRM_SAME_EVENT", note: "Synthetic operator confirmation" }),
    }), { params: Promise.resolve({ id: relationship.id }) });
    assert.equal(decisionResponse.status, 200);

    const cluster = await getConfirmedEventClusterIds(eventA.id);
    assert.equal(new Set(cluster).size, 2);
    assert(cluster.includes(eventB.id));

    const consensusRun = await refreshGraphConsensus();
    assert.equal(consensusRun.algorithmVersion, CONSENSUS_ALGORITHM_VERSION);
    const [consensusA, consensusB] = await Promise.all([
      prisma.consensusSnapshot.findFirst({ where: { canonicalEventId: eventA.id }, orderBy: { createdAt: "desc" } }),
      prisma.consensusSnapshot.findFirst({ where: { canonicalEventId: eventB.id }, orderBy: { createdAt: "desc" } }),
    ]);
    assert(consensusA && consensusB);
    assert.equal(consensusA.status, "READY");
    assert.equal(consensusB.status, "READY");
    assert.equal(consensusA.protocolCount, 2);
    assert.equal(consensusA.marketCount, 2);
    assert.equal(consensusA.algorithmVersion, CONSENSUS_ALGORITHM_VERSION);
    assert(consensusA.probability != null && consensusA.probability > 0.58 && consensusA.probability < 0.62);

    const after = await getPersistentEventGraph(eventA.id);
    assert(after);
    assert.equal(after.edges.find((edge) => edge.id === relationship.id)?.relationshipType, "SAME_EVENT_CONFIRMED");
    assert.equal(after.confirmedCluster.marketCount, 2);
    assert.equal(after.confirmedCluster.protocols.length, 2);

    console.log(JSON.stringify({
      status: "PASS",
      graphVersion: after.version,
      reviewQueue: "PASS",
      permissionBoundary: "PASS",
      confirmedClusterEvents: after.confirmedCluster.eventIds.length,
      confirmedClusterMarkets: after.confirmedCluster.marketCount,
      consensusStatus: consensusA.status,
      consensusAlgorithm: consensusA.algorithmVersion,
    }, null, 2));
  } finally {
    await prisma.consensusSnapshot.deleteMany({ where: { canonicalEventId: { in: [eventA.id, eventB.id] } } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { organizationId: organization.id } }).catch(() => undefined);
    await prisma.apiKey.deleteMany({ where: { organizationId: organization.id } }).catch(() => undefined);
    await prisma.eventRelationship.deleteMany({ where: { OR: [{ sourceEventId: { in: [eventA.id, eventB.id] } }, { targetEventId: { in: [eventA.id, eventB.id] } }] } }).catch(() => undefined);
    await prisma.market.deleteMany({ where: { id: { in: [marketA.id, marketB.id] } } }).catch(() => undefined);
    await prisma.canonicalEvent.deleteMany({ where: { id: { in: [eventA.id, eventB.id] } } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });