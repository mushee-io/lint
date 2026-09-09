import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getConfirmedEventClusterIds } from "@/lib/event-graph";
import { enqueueSignalDeliveries } from "@/lib/webhooks";

const json = (value: unknown) => value as Prisma.InputJsonValue;
export const CONSENSUS_ALGORITHM_VERSION = "consensus-v3-confidence";

export type ConsensusSeverity = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type ProtocolConsensusInput = {
  protocol: string;
  probability: number;
  reliabilityScore: number;
  freshnessScore: number;
  sourceHealthScore: number;
  historyDepthScore: number;
  liquidity: number;
  marketCount: number;
  representativeMarketId: string;
  marketIds: string[];
};

export type ConfidenceDecomposition = {
  agreement: number;
  protocolDiversity: number;
  sourceReliability: number;
  freshness: number;
  liquiditySupport: number;
  historyDepth: number;
  total: number;
};

export type ProtocolDivergence = {
  protocolA: string;
  protocolB: string;
  marketIds: string[];
  probabilityA: number;
  probabilityB: number;
  gap: number;
  severity: ConsensusSeverity;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function freshnessScore(value: string) {
  if (value === "FRESH") return 100;
  if (value === "AGING") return 78;
  if (value === "STALE") return 30;
  return 15;
}

function sourceHealthScore(state?: { freshness: string; consecutiveFailures: number; lastSuccessAt: Date | null }) {
  if (!state) return 55;
  const base = freshnessScore(state.freshness);
  const failurePenalty = Math.min(55, state.consecutiveFailures * 11);
  const agePenalty = state.lastSuccessAt ? Math.min(25, Math.max(0, (Date.now() - state.lastSuccessAt.getTime()) / 3_600_000) * 3) : 20;
  return clamp(Math.round(base - failurePenalty - agePenalty));
}

export function divergenceSeverity(gap: number): ConsensusSeverity {
  if (gap >= 0.30) return "CRITICAL";
  if (gap >= 0.20) return "HIGH";
  if (gap >= 0.12) return "MEDIUM";
  if (gap >= 0.07) return "LOW";
  return "NONE";
}

function severityRank(severity: ConsensusSeverity) {
  return { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[severity];
}

export function calculateConsensus(protocols: ProtocolConsensusInput[]) {
  if (protocols.length < 2) return null;

  const maxLiquidity = Math.max(...protocols.map((protocol) => protocol.liquidity), 1);
  const weighted = protocols.map((protocol) => {
    const reliabilityFactor = 0.35 + (protocol.reliabilityScore / 100) * 0.65;
    const liquidityFactor = 0.85 + Math.min(1, Math.log1p(protocol.liquidity) / Math.log1p(maxLiquidity)) * 0.15;
    return { ...protocol, consensusWeight: reliabilityFactor * liquidityFactor };
  });
  const totalWeight = weighted.reduce((sum, protocol) => sum + protocol.consensusWeight, 0);
  const probability = weighted.reduce((sum, protocol) => sum + protocol.probability * protocol.consensusWeight, 0) / totalWeight;
  const probabilities = protocols.map((protocol) => protocol.probability);
  const dispersion = Math.max(...probabilities) - Math.min(...probabilities);

  const divergences: ProtocolDivergence[] = [];
  for (let left = 0; left < protocols.length; left += 1) {
    for (let right = left + 1; right < protocols.length; right += 1) {
      const a = protocols[left];
      const b = protocols[right];
      const gap = Math.abs(a.probability - b.probability);
      divergences.push({
        protocolA: a.protocol,
        protocolB: b.protocol,
        marketIds: [a.representativeMarketId, b.representativeMarketId],
        probabilityA: a.probability,
        probabilityB: b.probability,
        gap,
        severity: divergenceSeverity(gap),
      });
    }
  }
  divergences.sort((a, b) => b.gap - a.gap);

  const totalLiquidity = protocols.reduce((sum, protocol) => sum + protocol.liquidity, 0);
  const confidence: ConfidenceDecomposition = {
    agreement: clamp(Math.round(100 - dispersion * 250)),
    protocolDiversity: clamp(protocols.length * 30),
    sourceReliability: Math.round(average(protocols.map((protocol) => protocol.sourceHealthScore))),
    freshness: Math.round(average(protocols.map((protocol) => protocol.freshnessScore))),
    liquiditySupport: clamp(Math.round(Math.log10(totalLiquidity + 1) * 25)),
    historyDepth: Math.round(average(protocols.map((protocol) => protocol.historyDepthScore))),
    total: 0,
  };
  confidence.total = Math.round(
    confidence.agreement * 0.30 +
    confidence.sourceReliability * 0.20 +
    confidence.freshness * 0.15 +
    confidence.protocolDiversity * 0.15 +
    confidence.liquiditySupport * 0.10 +
    confidence.historyDepth * 0.10,
  );

  return {
    probability,
    dispersion,
    confidence,
    confidenceLabel: confidence.total >= 80 ? "HIGH" : confidence.total >= 60 ? "MEDIUM" : "LOW",
    divergences,
    protocolInputs: weighted,
  };
}

async function sourceStateMap() {
  const states = await prisma.dataSourceState.findMany();
  return new Map(states.map((state) => [state.source, state]));
}

async function loadClusterProtocols(clusterIds: string[]) {
  const states = await sourceStateMap();
  const markets = await prisma.market.findMany({
    where: { canonicalEventId: { in: clusterIds } },
    include: {
      snapshots: { orderBy: { timestamp: "desc" }, take: 12 },
      provenance: { orderBy: { retrievedAt: "desc" }, take: 1 },
    },
  });

  const usable = markets.filter((market) => {
    const probability = market.snapshots.at(0)?.probability;
    return probability != null && market.freshness !== "STALE" && market.freshness !== "UNKNOWN";
  });
  const grouped = new Map<string, typeof usable>();
  for (const market of usable) {
    const current = grouped.get(market.protocolName) ?? [];
    current.push(market);
    grouped.set(market.protocolName, current);
  }

  const protocols: ProtocolConsensusInput[] = [];
  for (const [protocol, protocolMarkets] of grouped) {
    const marketWeights = protocolMarkets.map((market) => 1 + Math.log1p(Math.max(0, market.snapshots.at(0)?.liquidity ?? market.liquidity ?? 0)));
    const totalMarketWeight = marketWeights.reduce((sum, value) => sum + value, 0);
    const probability = protocolMarkets.reduce((sum, market, index) => sum + (market.snapshots.at(0)!.probability ?? 0) * marketWeights[index], 0) / totalMarketWeight;
    const liquidities = protocolMarkets.map((market) => Math.max(0, market.snapshots.at(0)?.liquidity ?? market.liquidity ?? 0));
    const freshness = protocolMarkets.map((market) => freshnessScore(market.freshness));
    const sourceScores = protocolMarkets.map((market) => {
      const source = market.provenance.at(0)?.source;
      return sourceHealthScore(source ? states.get(source) : undefined);
    });
    const historyScores = protocolMarkets.map((market) => clamp(market.snapshots.length * 10));
    const reliabilityScore = Math.round(average(sourceScores) * 0.50 + average(freshness) * 0.30 + average(historyScores) * 0.20);
    const representative = protocolMarkets.toSorted((a, b) => (b.snapshots.at(0)?.liquidity ?? 0) - (a.snapshots.at(0)?.liquidity ?? 0))[0];

    protocols.push({
      protocol,
      probability,
      reliabilityScore,
      freshnessScore: Math.round(average(freshness)),
      sourceHealthScore: Math.round(average(sourceScores)),
      historyDepthScore: Math.round(average(historyScores)),
      liquidity: liquidities.reduce((sum, value) => sum + value, 0),
      marketCount: protocolMarkets.length,
      representativeMarketId: representative.id,
      marketIds: protocolMarkets.map((market) => market.id),
    });
  }

  return { markets, usable, protocols };
}

async function emitDivergenceAlert(input: {
  clusterIds: string[];
  rootEventId: string;
  marketIds: string[];
  divergence: ProtocolDivergence;
  previousDispersion: number | null;
}) {
  const severity = input.divergence.severity;
  if (severityRank(severity) < severityRank("HIGH")) return 0;
  const previousSeverity = divergenceSeverity(input.previousDispersion ?? 0);
  if (severityRank(severity) <= severityRank(previousSeverity)) return 0;

  const watches = await prisma.watchRegistration.findMany({
    where: { active: true, marketId: { in: input.marketIds } },
    select: { organizationId: true },
  });
  const organizations = [...new Set(watches.map((watch) => watch.organizationId))];
  let created = 0;

  for (const organizationId of organizations) {
    const dedupeKey = `consensus-divergence:${organizationId}:${input.rootEventId}:${severity}:${input.divergence.protocolA}:${input.divergence.protocolB}`;
    const existing = await prisma.riskSignal.findUnique({ where: { dedupeKey } });
    if (existing) continue;
    const signal = await prisma.riskSignal.create({
      data: {
        organizationId,
        marketId: input.divergence.marketIds.at(0) ?? null,
        eventId: input.rootEventId,
        type: "CONSENSUS_DIVERGENCE",
        severity: severity === "CRITICAL" ? "CRITICAL" : "HIGH",
        confidence: Math.min(0.99, 0.78 + input.divergence.gap * 0.6),
        explanation: `${input.divergence.protocolA} and ${input.divergence.protocolB} disagree materially on the same confirmed event cluster.`,
        evidence: json({
          graphClusterEventIds: input.clusterIds,
          protocolA: input.divergence.protocolA,
          protocolB: input.divergence.protocolB,
          probabilityA: input.divergence.probabilityA,
          probabilityB: input.divergence.probabilityB,
          gap: input.divergence.gap,
          severity,
          algorithmVersion: CONSENSUS_ALGORITHM_VERSION,
        }),
        recommendedAction: severity === "CRITICAL" ? "ESCALATE_CROSS_PROTOCOL_DIVERGENCE" : "REVIEW_CROSS_PROTOCOL_DIVERGENCE",
        algorithmVersion: CONSENSUS_ALGORITHM_VERSION,
        dedupeKey,
      },
    });
    await enqueueSignalDeliveries(signal);
    created += 1;
  }
  return created;
}

export async function refreshGraphConsensus() {
  const events = await prisma.canonicalEvent.findMany({ select: { id: true } });
  const visited = new Set<string>();
  let clustersChecked = 0;
  let snapshotsCreated = 0;
  let insufficientData = 0;
  let stale = 0;
  let divergenceAlertsCreated = 0;

  for (const event of events) {
    if (visited.has(event.id)) continue;
    const clusterIds = await getConfirmedEventClusterIds(event.id);
    clusterIds.forEach((id) => visited.add(id));
    clustersChecked += 1;

    const { markets, protocols } = await loadClusterProtocols(clusterIds);
    const allProtocolCount = new Set(markets.map((market) => market.protocolName)).size;
    const previous = await prisma.consensusSnapshot.findFirst({ where: { canonicalEventId: event.id }, orderBy: { createdAt: "desc" } });

    if (protocols.length < 2) {
      const status = allProtocolCount >= 2 ? "STALE" : "INSUFFICIENT_DATA";
      for (const canonicalEventId of clusterIds) {
        await prisma.consensusSnapshot.create({
          data: {
            canonicalEventId,
            status,
            probability: null,
            confidence: "NONE",
            eventConfidenceScore: null,
            marketCount: markets.length,
            protocolCount: protocols.length,
            dispersion: null,
            inputs: json({ graphClusterEventIds: clusterIds, protocols, confidenceDecomposition: null, divergences: [], reason: status === "STALE" ? "Multiple venues exist but fewer than two have fresh usable probability data." : "At least two independent protocols are required." }),
            algorithmVersion: CONSENSUS_ALGORITHM_VERSION,
          },
        });
        snapshotsCreated += 1;
      }
      if (status === "STALE") stale += 1;
      else insufficientData += 1;
      continue;
    }

    const result = calculateConsensus(protocols)!;
    const payload = {
      graphClusterEventIds: clusterIds,
      protocols: result.protocolInputs,
      confidenceDecomposition: result.confidence,
      divergences: result.divergences,
      methodology: "Venue-balanced probability weighted by source reliability and capped liquidity support. Confidence decomposes agreement, protocol diversity, source reliability, freshness, liquidity support, and history depth.",
    };

    for (const canonicalEventId of clusterIds) {
      await prisma.consensusSnapshot.create({
        data: {
          canonicalEventId,
          status: "READY",
          probability: result.probability,
          confidence: result.confidenceLabel,
          eventConfidenceScore: result.confidence.total,
          marketCount: markets.length,
          protocolCount: protocols.length,
          dispersion: result.dispersion,
          inputs: json(payload),
          algorithmVersion: CONSENSUS_ALGORITHM_VERSION,
        },
      });
      snapshotsCreated += 1;
    }

    const strongestDivergence = result.divergences.at(0);
    if (strongestDivergence) {
      divergenceAlertsCreated += await emitDivergenceAlert({
        clusterIds,
        rootEventId: event.id,
        marketIds: markets.map((market) => market.id),
        divergence: strongestDivergence,
        previousDispersion: previous?.dispersion ?? null,
      });
    }
  }

  return { eventsChecked: events.length, clustersChecked, snapshotsCreated, insufficientData, stale, divergenceAlertsCreated, algorithmVersion: CONSENSUS_ALGORITHM_VERSION };
}

export async function getConsensusIntelligence(eventId: string) {
  const event = await prisma.canonicalEvent.findUnique({ where: { id: eventId }, select: { id: true, title: true, description: true } });
  if (!event) return null;
  const clusterIds = await getConfirmedEventClusterIds(eventId);
  const history = await prisma.consensusSnapshot.findMany({ where: { canonicalEventId: eventId }, orderBy: { createdAt: "desc" }, take: 50 });
  const latest = history.at(0) ?? null;
  const previousReady = history.slice(1).find((snapshot) => snapshot.status === "READY" && snapshot.probability != null) ?? null;
  const latestInputs = latest?.inputs && typeof latest.inputs === "object" && !Array.isArray(latest.inputs) ? latest.inputs as Record<string, unknown> : {};

  return {
    canonicalEventId: eventId,
    event,
    graphClusterEventIds: clusterIds,
    latest: latest ?? { status: "INSUFFICIENT_DATA", probability: null, protocolCount: 0, marketCount: 0, confidence: "NONE", eventConfidenceScore: null, dispersion: null, algorithmVersion: CONSENSUS_ALGORITHM_VERSION },
    confidenceDecomposition: latestInputs.confidenceDecomposition ?? null,
    divergences: latestInputs.divergences ?? [],
    protocols: latestInputs.protocols ?? [],
    trend: latest?.probability != null && previousReady?.probability != null ? {
      previousProbability: previousReady.probability,
      currentProbability: latest.probability,
      delta: latest.probability - previousReady.probability,
      previousAt: previousReady.createdAt.toISOString(),
      currentAt: latest.createdAt.toISOString(),
    } : null,
    history,
  };
}

export async function getProtocolReliability(protocolName: string) {
  const states = await sourceStateMap();
  const markets = await prisma.market.findMany({
    where: { protocolName },
    include: {
      snapshots: { orderBy: { timestamp: "desc" }, take: 12 },
      provenance: { orderBy: { retrievedAt: "desc" }, take: 1 },
    },
    take: 500,
  });
  if (!markets.length) return null;

  const freshness = markets.map((market) => freshnessScore(market.freshness));
  const sourceScores = markets.map((market) => {
    const source = market.provenance.at(0)?.source;
    return sourceHealthScore(source ? states.get(source) : undefined);
  });
  const history = markets.map((market) => clamp(market.snapshots.length * 10));
  const score = Math.round(average(sourceScores) * 0.50 + average(freshness) * 0.30 + average(history) * 0.20);
  const sources = [...new Set(markets.map((market) => market.provenance.at(0)?.source).filter((source): source is string => Boolean(source)))];

  return {
    protocol: protocolName,
    score,
    confidence: markets.length >= 20 ? "HIGH" : markets.length >= 5 ? "MEDIUM" : "LOW",
    dimensions: {
      sourceHealth: Math.round(average(sourceScores)),
      freshness: Math.round(average(freshness)),
      historyDepth: Math.round(average(history)),
    },
    observedMarkets: markets.length,
    freshMarkets: markets.filter((market) => market.freshness === "FRESH").length,
    staleOrUnknownMarkets: markets.filter((market) => market.freshness === "STALE" || market.freshness === "UNKNOWN").length,
    sources,
    methodology: "Operational reliability from observed source health, persisted market freshness, and snapshot history. It is not a moral, governance, or settlement-authority rating.",
    algorithmVersion: CONSENSUS_ALGORITHM_VERSION,
  };
}
