import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { scoreMarket } from "@/lib/market-score";
import { freshnessPenalty } from "@/lib/freshness";
import { enqueueSignalDeliveries } from "@/lib/webhooks";

const json = (value: unknown) => value as Prisma.InputJsonValue;
const ALGORITHM_VERSION = "risk-v1";

function words(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 2));
}

function similarity(a: string, b: string) {
  const left = words(a);
  const right = words(b);
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  return [...left].filter((word) => right.has(word)).length / union.size;
}

function sourceAssessment(raw?: string | null) {
  if (!raw) return { available: false, reliability: 20, risk: "HIGH" };
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    const blocked = host === "localhost" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || host === "::1";
    if (blocked) return { available: false, reliability: 10, risk: "HIGH" };
    const reliability = host.includes(".gov") || host.endsWith("gov") ? 92 : host.includes("coinbase") ? 84 : 62;
    return { available: true, reliability, risk: reliability < 60 ? "HIGH" : "LOW" };
  } catch {
    return { available: false, reliability: 20, risk: "HIGH" };
  }
}

export async function runDurableGuard(input: { title: string; description?: string; outcomes?: string[]; resolutionSource?: string; closeTime?: string; organizationId?: string; protocolId?: string; marketId?: string }) {
  const score = scoreMarket({ title: input.title, description: input.description, outcomes: input.outcomes, resolutionSource: input.resolutionSource, resolutionTime: input.closeTime });
  const candidates = await prisma.market.findMany({ select: { id: true, title: true, protocolName: true }, orderBy: { updatedAt: "desc" }, take: 500 });
  const duplicates = candidates
    .map((candidate) => ({ ...candidate, similarity: similarity(input.title, candidate.title) }))
    .filter((candidate) => candidate.similarity >= 0.25)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10);
  const maxSimilarity = duplicates.at(0)?.similarity ?? 0;
  const duplicateRisk = maxSimilarity >= 0.6 ? "HIGH" : maxSimilarity >= 0.35 ? "MEDIUM" : "LOW";
  const source = sourceAssessment(input.resolutionSource);
  const ambiguityRisk = score.settlementAmbiguity < 65 ? "HIGH" : "LOW";
  const manipulationRisk = score.manipulationRisk < 70 ? "MEDIUM" : "LOW";
  const warnings: string[] = [];
  if (!source.available) warnings.push("Resolution source is missing, invalid, or unsafe; manual review is required.");
  if (duplicateRisk !== "LOW") warnings.push("A persisted market has a materially similar title; compare exact conditions before listing.");
  if (!input.closeTime) warnings.push("No explicit UTC observation deadline was supplied.");

  const strongBlock = score.overall < 30 && !source.available;
  const decision = strongBlock ? "BLOCK" : (!source.available || duplicateRisk === "HIGH" || score.overall < 75 || ambiguityRisk === "HIGH") ? "REVIEW" : "ALLOW";
  const reasons = decision === "ALLOW" ? ["Persisted-data construction checks passed configured thresholds."] : warnings.length ? warnings : ["Manual review is required by configured policy."];

  const evaluation = await prisma.guardEvaluation.create({
    data: {
      organizationId: input.organizationId,
      protocolId: input.protocolId,
      marketId: input.marketId,
      decision,
      marketLintScore: score.overall,
      duplicateRisk,
      ambiguityRisk,
      resolutionRisk: source.risk,
      manipulationRisk,
      warnings: json(warnings),
      reasons: json(reasons),
      evidence: json({
        duplicateCandidates: duplicates.map((item) => ({ id: item.id, protocol: item.protocolName, similarity: Number(item.similarity.toFixed(4)) })),
        sourceReliability: source.reliability,
      }),
      algorithmVersion: "guard-v1",
    },
  });

  return {
    id: evaluation.id,
    decision,
    marketLintScore: score.overall,
    duplicateRisk,
    ambiguityRisk,
    resolutionRisk: source.risk,
    manipulationRisk,
    warnings,
    reasons,
    evidence: { duplicateCandidates: duplicates, sourceReliability: source.reliability },
    algorithmVersion: evaluation.algorithmVersion,
  };
}

async function persistSignal(input: { organizationId: string; watchId: string; marketId: string; eventId?: string | null; type: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; confidence: number; explanation: string; evidence: Record<string, unknown>; recommendedAction: string; dedupeKey: string }) {
  const signal = await prisma.riskSignal.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
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
      algorithmVersion: ALGORITHM_VERSION,
    },
  });
  await enqueueSignalDeliveries({ ...signal, evidence: signal.evidence });
  return signal;
}

export async function refreshWatches() {
  const watches = await prisma.watchRegistration.findMany({
    where: { active: true },
    include: { market: { include: { snapshots: { orderBy: { timestamp: "desc" }, take: 2 } } } },
  });
  let signalsCreated = 0;

  for (const watch of watches) {
    const [latest, previous] = watch.market.snapshots;
    if (!latest) continue;
    const baseKey = `${watch.id}:${latest.id}`;

    if (watch.market.freshness === "STALE" || watch.market.freshness === "UNKNOWN") {
      await persistSignal({
        organizationId: watch.organizationId,
        watchId: watch.id,
        marketId: watch.marketId,
        eventId: watch.market.canonicalEventId,
        type: "DATA_STALE",
        severity: watch.market.freshness === "UNKNOWN" ? "HIGH" : "MEDIUM",
        confidence: 0.99,
        explanation: "The watched market feed is not fresh enough for normal automated interpretation.",
        evidence: { freshness: watch.market.freshness, penalty: freshnessPenalty(watch.market.freshness) },
        recommendedAction: "REVIEW",
        dedupeKey: `${baseKey}:DATA_STALE`,
      });
      signalsCreated += 1;
    }

    if (previous && latest.probability != null && previous.probability != null) {
      const move = Math.abs(latest.probability - previous.probability);
      if (move >= 0.25) {
        await persistSignal({
          organizationId: watch.organizationId,
          watchId: watch.id,
          marketId: watch.marketId,
          eventId: watch.market.canonicalEventId,
          type: "PRICE_ANOMALY",
          severity: move >= 0.4 ? "CRITICAL" : "HIGH",
          confidence: 0.96,
          explanation: "Probability moved beyond the configured single-observation threshold.",
          evidence: { previousProbability: previous.probability, currentProbability: latest.probability, move },
          recommendedAction: "REVIEW",
          dedupeKey: `${baseKey}:PRICE_ANOMALY`,
        });
        signalsCreated += 1;
      }
    }

    if (previous?.liquidity != null && latest.liquidity != null && previous.liquidity > 0 && latest.liquidity < previous.liquidity * 0.7) {
      await persistSignal({
        organizationId: watch.organizationId,
        watchId: watch.id,
        marketId: watch.marketId,
        eventId: watch.market.canonicalEventId,
        type: "LIQUIDITY_RISK",
        severity: "HIGH",
        confidence: 0.94,
        explanation: "Liquidity fell by more than 30% between persisted observations.",
        evidence: { previousLiquidity: previous.liquidity, currentLiquidity: latest.liquidity },
        recommendedAction: "REVIEW",
        dedupeKey: `${baseKey}:LIQUIDITY_RISK`,
      });
      signalsCreated += 1;
    }

    await prisma.watchRegistration.update({ where: { id: watch.id }, data: { lastEvaluatedAt: new Date(), lastSnapshotId: latest.id } });
  }
  return { watchesChecked: watches.length, signalsCreated };
}

export async function refreshConsensus() {
  const events = await prisma.canonicalEvent.findMany({
    include: { markets: { include: { snapshots: { orderBy: { timestamp: "desc" }, take: 1 } } } },
  });
  let snapshotsCreated = 0;
  let insufficient = 0;

  for (const event of events) {
    const inputs = event.markets
      .map((market) => ({ market, snapshot: market.snapshots.at(0) }))
      .filter((item) => item.snapshot?.probability != null && item.market.freshness !== "STALE" && item.market.freshness !== "UNKNOWN")
      .map((item) => ({ marketId: item.market.id, protocol: item.market.protocolName, probability: item.snapshot!.probability!, liquidity: item.snapshot!.liquidity ?? 0, freshness: item.market.freshness }));
    const protocols = [...new Set(inputs.map((item) => item.protocol))];
    if (protocols.length < 2) {
      await prisma.consensusSnapshot.create({
        data: { canonicalEventId: event.id, status: "INSUFFICIENT_DATA", probability: null, confidence: "NONE", eventConfidenceScore: null, marketCount: inputs.length, protocolCount: protocols.length, dispersion: null, inputs: json(inputs) },
      });
      insufficient += 1;
      snapshotsCreated += 1;
      continue;
    }

    const values = inputs.map((item) => item.probability);
    const totalWeight = inputs.reduce((sum, item) => sum + Math.max(1, item.liquidity), 0);
    const probability = inputs.reduce((sum, item) => sum + item.probability * Math.max(1, item.liquidity), 0) / totalWeight;
    const dispersion = Math.max(...values) - Math.min(...values);
    const score = Math.max(0, Math.min(100, Math.round(90 - dispersion * 200 + Math.min(protocols.length, 4) * 5)));
    await prisma.consensusSnapshot.create({
      data: { canonicalEventId: event.id, status: "READY", probability, confidence: score >= 80 ? "HIGH" : score >= 55 ? "MEDIUM" : "LOW", eventConfidenceScore: score, marketCount: inputs.length, protocolCount: protocols.length, dispersion, inputs: json(inputs) },
    });
    snapshotsCreated += 1;
  }
  return { eventsChecked: events.length, snapshotsCreated, insufficientData: insufficient };
}
