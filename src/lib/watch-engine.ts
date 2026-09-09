import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { freshnessPenalty } from "@/lib/freshness";
import { enqueueSignalDeliveries } from "@/lib/webhooks";

const json = (value: unknown) => value as Prisma.InputJsonValue;
export const WATCH_ALGORITHM_VERSION = "watch-v2";

const POLICY = {
  probabilityHigh: 0.15,
  probabilityCritical: 0.30,
  probabilityBaselineDeviation: 0.20,
  liquidityHighDrop: 0.35,
  liquidityCriticalDrop: 0.60,
  liquidityRecentDrawdown: 0.50,
  volumeSpikeMultiplier: 5,
  volumeSpikeProbabilityMove: 0.05,
  sourceFailureHigh: 2,
  sourceFailureCritical: 5,
} as const;

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type SignalInput = {
  organizationId: string;
  watchId: string;
  marketId: string;
  eventId?: string | null;
  type: string;
  severity: Severity;
  confidence: number;
  explanation: string;
  evidence: Record<string, unknown>;
  recommendedAction: string;
  dedupeKey: string;
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sourceFingerprint(value: string | null | undefined) {
  return (value ?? "UNAVAILABLE").trim().toLowerCase();
}

function shortHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function persistSignal(input: SignalInput) {
  const existing = await prisma.riskSignal.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing) return { signal: existing, created: false };

  const signal = await prisma.riskSignal.create({
    data: {
      organizationId: input.organizationId,
      watchId: input.watchId,
      marketId: input.marketId,
      eventId: input.eventId,
      type: input.type,
      severity: input.severity,
      confidence: input.confidence,
      explanation: input.explanation,
      evidence: json(input.evidence),
      recommendedAction: input.recommendedAction,
      dedupeKey: input.dedupeKey,
      algorithmVersion: WATCH_ALGORITHM_VERSION,
    },
  });
  await enqueueSignalDeliveries({ ...signal, evidence: signal.evidence });
  return { signal, created: true };
}

async function latestWatchBaseline(watchId: string, organizationId: string) {
  const log = await prisma.auditLog.findFirst({
    where: { organizationId, resourceType: "WatchRegistration", resourceId: watchId, action: "WATCH_BASELINE" },
    orderBy: { createdAt: "desc" },
  });
  const metadata = log?.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
    ? log.metadata as Record<string, unknown>
    : null;
  return {
    resolutionSource: typeof metadata?.resolutionSource === "string" ? metadata.resolutionSource : null,
    marketStatus: typeof metadata?.marketStatus === "string" ? metadata.marketStatus : null,
  };
}

export async function recordWatchBaseline(input: {
  organizationId: string;
  watchId: string;
  marketId: string;
  resolutionSource?: string | null;
  marketStatus?: string | null;
  actorType?: string;
  actorId?: string | null;
}) {
  return prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorType: input.actorType ?? "SYSTEM",
      actorId: input.actorId ?? null,
      action: "WATCH_BASELINE",
      resourceType: "WatchRegistration",
      resourceId: input.watchId,
      metadata: json({
        marketId: input.marketId,
        resolutionSource: sourceFingerprint(input.resolutionSource),
        marketStatus: input.marketStatus ?? null,
        algorithmVersion: WATCH_ALGORITHM_VERSION,
      }),
    },
  });
}

export async function refreshWatchEngine(options: { organizationId?: string } = {}) {
  const watches = await prisma.watchRegistration.findMany({
    where: { active: true, ...(options.organizationId ? { organizationId: options.organizationId } : {}) },
    include: {
      protocol: true,
      market: { include: { snapshots: { orderBy: { timestamp: "desc" }, take: 12 } } },
    },
  });

  const summary: Record<string, number> = {};
  let signalsCreated = 0;

  const emit = async (input: SignalInput) => {
    const result = await persistSignal(input);
    if (result.created) {
      signalsCreated += 1;
      summary[input.type] = (summary[input.type] ?? 0) + 1;
    }
  };

  for (const watch of watches) {
    const snapshots = watch.market.snapshots;
    const latest = snapshots.at(0);
    if (!latest) continue;
    const previous = snapshots.at(1);
    const baseKey = `${watch.id}:${latest.id}`;

    if (watch.market.freshness === "STALE" || watch.market.freshness === "UNKNOWN") {
      await emit({
        organizationId: watch.organizationId,
        watchId: watch.id,
        marketId: watch.marketId,
        eventId: watch.market.canonicalEventId,
        type: "DATA_STALE",
        severity: watch.market.freshness === "UNKNOWN" ? "HIGH" : "MEDIUM",
        confidence: 0.99,
        explanation: "The watched market feed is not fresh enough for normal automated interpretation.",
        evidence: {
          freshness: watch.market.freshness,
          penalty: freshnessPenalty(watch.market.freshness),
          lastIngestedAt: watch.market.lastIngestedAt.toISOString(),
        },
        recommendedAction: "VERIFY_DATA_SOURCE",
        dedupeKey: `${baseKey}:DATA_STALE`,
      });
    }

    if (watch.protocol.sourceName) {
      const sourceState = await prisma.dataSourceState.findUnique({ where: { source: watch.protocol.sourceName } });
      if (sourceState && (sourceState.consecutiveFailures >= POLICY.sourceFailureHigh || sourceState.freshness === "STALE" || sourceState.freshness === "UNKNOWN")) {
        const critical = sourceState.consecutiveFailures >= POLICY.sourceFailureCritical;
        await emit({
          organizationId: watch.organizationId,
          watchId: watch.id,
          marketId: watch.marketId,
          eventId: watch.market.canonicalEventId,
          type: "SOURCE_FAILURE",
          severity: critical ? "CRITICAL" : "HIGH",
          confidence: 0.99,
          explanation: "The upstream source serving this watched market is failing or has unknown/stale health.",
          evidence: {
            source: sourceState.source,
            freshness: sourceState.freshness,
            consecutiveFailures: sourceState.consecutiveFailures,
            lastSuccessAt: sourceState.lastSuccessAt?.toISOString() ?? null,
            lastError: sourceState.lastError,
          },
          recommendedAction: critical ? "ESCALATE_SOURCE_OUTAGE" : "VERIFY_DATA_SOURCE",
          dedupeKey: `${watch.id}:${sourceState.source}:${sourceState.consecutiveFailures}:${sourceState.freshness}:SOURCE_FAILURE`,
        });
      }
    }

    if (previous && latest.probability != null && previous.probability != null) {
      const move = Math.abs(latest.probability - previous.probability);
      if (move >= POLICY.probabilityHigh) {
        await emit({
          organizationId: watch.organizationId,
          watchId: watch.id,
          marketId: watch.marketId,
          eventId: watch.market.canonicalEventId,
          type: "PROBABILITY_SHOCK",
          severity: move >= POLICY.probabilityCritical ? "CRITICAL" : "HIGH",
          confidence: Math.min(0.99, 0.82 + move * 0.4),
          explanation: "Probability moved beyond the configured single-observation surveillance threshold.",
          evidence: {
            previousProbability: previous.probability,
            currentProbability: latest.probability,
            absoluteMove: move,
            threshold: POLICY.probabilityHigh,
          },
          recommendedAction: move >= POLICY.probabilityCritical ? "ESCALATE_IMMEDIATELY" : "REVIEW_MARKET_MOVE",
          dedupeKey: `${baseKey}:PROBABILITY_SHOCK`,
        });
      }

      const priorProbabilities = snapshots.slice(1, 7).map((snapshot) => snapshot.probability).filter((value): value is number => value != null);
      const baseline = median(priorProbabilities);
      if (baseline != null) {
        const deviation = Math.abs(latest.probability - baseline);
        if (priorProbabilities.length >= 4 && deviation >= POLICY.probabilityBaselineDeviation) {
          await emit({
            organizationId: watch.organizationId,
            watchId: watch.id,
            marketId: watch.marketId,
            eventId: watch.market.canonicalEventId,
            type: "PROBABILITY_REGIME_SHIFT",
            severity: deviation >= 0.35 ? "CRITICAL" : "HIGH",
            confidence: 0.91,
            explanation: "Current probability materially diverged from the recent persisted baseline, not only the prior tick.",
            evidence: { currentProbability: latest.probability, recentMedian: baseline, deviation, baselineSamples: priorProbabilities.length },
            recommendedAction: "REVIEW_EVENT_OR_INFORMATION_SHOCK",
            dedupeKey: `${baseKey}:PROBABILITY_REGIME_SHIFT`,
          });
        }
      }
    }

    if (latest.liquidity != null) {
      if (previous?.liquidity != null && previous.liquidity > 0) {
        const drop = Math.max(0, 1 - latest.liquidity / previous.liquidity);
        if (drop >= POLICY.liquidityHighDrop) {
          await emit({
            organizationId: watch.organizationId,
            watchId: watch.id,
            marketId: watch.marketId,
            eventId: watch.market.canonicalEventId,
            type: "LIQUIDITY_DRAWDOWN",
            severity: drop >= POLICY.liquidityCriticalDrop ? "CRITICAL" : "HIGH",
            confidence: 0.95,
            explanation: "Available liquidity deteriorated sharply between persisted observations.",
            evidence: { previousLiquidity: previous.liquidity, currentLiquidity: latest.liquidity, relativeDrop: drop },
            recommendedAction: drop >= POLICY.liquidityCriticalDrop ? "ESCALATE_LIQUIDITY_EVENT" : "REVIEW_LIQUIDITY",
            dedupeKey: `${baseKey}:LIQUIDITY_DRAWDOWN`,
          });
        }
      }

      const recentLiquidities = snapshots.slice(1, 7).map((snapshot) => snapshot.liquidity).filter((value): value is number => value != null && value > 0);
      const recentMax = recentLiquidities.length ? Math.max(...recentLiquidities) : null;
      if (recentMax && latest.liquidity <= recentMax * POLICY.liquidityRecentDrawdown) {
        await emit({
          organizationId: watch.organizationId,
          watchId: watch.id,
          marketId: watch.marketId,
          eventId: watch.market.canonicalEventId,
          type: "LIQUIDITY_REGIME_CHANGE",
          severity: "HIGH",
          confidence: 0.90,
          explanation: "Liquidity is less than half of the recent persisted high-water mark.",
          evidence: { currentLiquidity: latest.liquidity, recentMaxLiquidity: recentMax, ratio: latest.liquidity / recentMax },
          recommendedAction: "REVIEW_LIQUIDITY",
          dedupeKey: `${baseKey}:LIQUIDITY_REGIME_CHANGE`,
        });
      }
    }

    const chronological = [...snapshots].reverse();
    const volumeDeltas: number[] = [];
    for (let index = 1; index < chronological.length; index += 1) {
      const before = chronological[index - 1].volume;
      const after = chronological[index].volume;
      if (before != null && after != null && after >= before) volumeDeltas.push(after - before);
    }
    if (volumeDeltas.length >= 4) {
      const latestDelta = volumeDeltas.at(-1) ?? 0;
      const baselineDelta = median(volumeDeltas.slice(0, -1).filter((value) => value > 0));
      const priceMove = previous?.probability != null && latest.probability != null ? Math.abs(latest.probability - previous.probability) : 0;
      if (baselineDelta != null && baselineDelta > 0 && latestDelta >= baselineDelta * POLICY.volumeSpikeMultiplier && priceMove >= POLICY.volumeSpikeProbabilityMove) {
        await emit({
          organizationId: watch.organizationId,
          watchId: watch.id,
          marketId: watch.marketId,
          eventId: watch.market.canonicalEventId,
          type: "VOLUME_ACCELERATION",
          severity: priceMove >= POLICY.probabilityHigh ? "HIGH" : "MEDIUM",
          confidence: 0.86,
          explanation: "Trading volume accelerated far above its recent persisted baseline while probability also moved.",
          evidence: { latestVolumeDelta: latestDelta, medianPriorDelta: baselineDelta, multiplier: latestDelta / baselineDelta, probabilityMove: priceMove },
          recommendedAction: "REVIEW_FLOW_AND_PRICE_MOVE",
          dedupeKey: `${baseKey}:VOLUME_ACCELERATION`,
        });
      }
    }

    const baseline = await latestWatchBaseline(watch.id, watch.organizationId);
    const currentResolution = sourceFingerprint(watch.market.resolutionSource);
    if (!baseline.resolutionSource) {
      await recordWatchBaseline({ organizationId: watch.organizationId, watchId: watch.id, marketId: watch.marketId, resolutionSource: currentResolution, marketStatus: watch.market.status });
    } else if (baseline.resolutionSource !== currentResolution) {
      await emit({
        organizationId: watch.organizationId,
        watchId: watch.id,
        marketId: watch.marketId,
        eventId: watch.market.canonicalEventId,
        type: "RESOLUTION_SOURCE_CHANGED",
        severity: "HIGH",
        confidence: 0.99,
        explanation: "The market resolution source changed after Watch monitoring began.",
        evidence: { previousResolutionSource: baseline.resolutionSource, currentResolutionSource: currentResolution },
        recommendedAction: "HOLD_AND_REVIEW_RESOLUTION_CHANGE",
        dedupeKey: `${watch.id}:${shortHash(`${baseline.resolutionSource}->${currentResolution}`)}:RESOLUTION_SOURCE_CHANGED`,
      });
      await recordWatchBaseline({ organizationId: watch.organizationId, watchId: watch.id, marketId: watch.marketId, resolutionSource: currentResolution, marketStatus: watch.market.status });
    }

    await prisma.watchRegistration.update({
      where: { id: watch.id },
      data: { lastEvaluatedAt: new Date(), lastSnapshotId: latest.id },
    });
  }

  return { watchesChecked: watches.length, signalsCreated, signalsByType: summary, algorithmVersion: WATCH_ALGORITHM_VERSION };
}
