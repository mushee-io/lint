import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getConfirmedEventClusterIds } from "@/lib/event-graph";

const json = (value: unknown) => value as Prisma.InputJsonValue;
export const CONSENSUS_ALGORITHM_VERSION = "consensus-v2-graph";

export async function refreshGraphConsensus() {
  const events = await prisma.canonicalEvent.findMany({ select: { id: true } });
  const visited = new Set<string>();
  let clustersChecked = 0;
  let snapshotsCreated = 0;
  let insufficientData = 0;

  for (const event of events) {
    if (visited.has(event.id)) continue;
    const clusterIds = await getConfirmedEventClusterIds(event.id);
    clusterIds.forEach((id) => visited.add(id));
    clustersChecked += 1;

    const markets = await prisma.market.findMany({
      where: { canonicalEventId: { in: clusterIds } },
      include: { snapshots: { orderBy: { timestamp: "desc" }, take: 1 } },
    });
    const inputs = markets
      .map((market) => ({ market, snapshot: market.snapshots.at(0) }))
      .filter((item) => item.snapshot?.probability != null && item.market.freshness !== "STALE" && item.market.freshness !== "UNKNOWN")
      .map((item) => ({
        marketId: item.market.id,
        canonicalEventId: item.market.canonicalEventId,
        protocol: item.market.protocolName,
        probability: item.snapshot!.probability!,
        liquidity: item.snapshot!.liquidity ?? 0,
        freshness: item.market.freshness,
      }));
    const protocols = [...new Set(inputs.map((item) => item.protocol))];

    if (protocols.length < 2) {
      for (const canonicalEventId of clusterIds) {
        await prisma.consensusSnapshot.create({
          data: {
            canonicalEventId,
            status: "INSUFFICIENT_DATA",
            probability: null,
            confidence: "NONE",
            eventConfidenceScore: null,
            marketCount: inputs.length,
            protocolCount: protocols.length,
            dispersion: null,
            inputs: json({ graphClusterEventIds: clusterIds, markets: inputs }),
            algorithmVersion: CONSENSUS_ALGORITHM_VERSION,
          },
        });
        snapshotsCreated += 1;
      }
      insufficientData += 1;
      continue;
    }

    const values = inputs.map((item) => item.probability);
    const totalWeight = inputs.reduce((sum, item) => sum + Math.max(1, item.liquidity), 0);
    const probability = inputs.reduce((sum, item) => sum + item.probability * Math.max(1, item.liquidity), 0) / totalWeight;
    const dispersion = Math.max(...values) - Math.min(...values);
    const score = Math.max(0, Math.min(100, Math.round(90 - dispersion * 200 + Math.min(protocols.length, 4) * 5)));

    for (const canonicalEventId of clusterIds) {
      await prisma.consensusSnapshot.create({
        data: {
          canonicalEventId,
          status: "READY",
          probability,
          confidence: score >= 80 ? "HIGH" : score >= 55 ? "MEDIUM" : "LOW",
          eventConfidenceScore: score,
          marketCount: inputs.length,
          protocolCount: protocols.length,
          dispersion,
          inputs: json({ graphClusterEventIds: clusterIds, markets: inputs }),
          algorithmVersion: CONSENSUS_ALGORITHM_VERSION,
        },
      });
      snapshotsCreated += 1;
    }
  }

  return { eventsChecked: events.length, clustersChecked, snapshotsCreated, insufficientData, algorithmVersion: CONSENSUS_ALGORITHM_VERSION };
}
