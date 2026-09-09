import { canonicalTitleSimilarity } from "@/lib/canonical";
import { prisma } from "@/lib/db";

export type IntelligenceStatus = "STRONG" | "WATCH" | "WEAK";
export type IntelligenceSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH";

export type IntelligenceDimension = {
  code: string;
  label: string;
  score: number;
  status: "PASS" | "WARN" | "FAIL";
  summary: string;
  evidence: Record<string, unknown>;
};

export type IntelligenceSnapshot = {
  timestamp: Date | string;
  probability?: number | null;
  liquidity?: number | null;
  volume?: number | null;
};

export type IntelligenceDuplicate = {
  id: string;
  title: string;
  protocol: string;
  similarity: number;
};

export type IntelligenceContext = {
  marketId: string;
  title: string;
  description?: string | null;
  protocolName: string;
  status: string;
  resolutionSource?: string | null;
  freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  liquidity?: number | null;
  volume?: number | null;
  snapshots: IntelligenceSnapshot[];
  source?: {
    name: string;
    freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
    consecutiveFailures: number;
    lastSuccessAt?: Date | string | null;
    lastError?: string | null;
  } | null;
  canonicalEvent?: {
    id: string;
    marketCount: number;
    protocolCount: number;
    latestConsensus?: {
      status: "READY" | "INSUFFICIENT_DATA" | "STALE";
      probability?: number | null;
      confidence: string;
      eventConfidenceScore?: number | null;
      dispersion?: number | null;
      createdAt: Date | string;
    } | null;
  } | null;
  duplicateCandidates: IntelligenceDuplicate[];
  relationshipCandidates?: Array<{
    eventId: string;
    relationshipType: string;
    confidence: number;
    reason: string;
  }>;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function statusFor(score: number): IntelligenceDimension["status"] {
  if (score < 50) return "FAIL";
  if (score < 75) return "WARN";
  return "PASS";
}

function gradeFor(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function sourceAssessment(raw?: string | null) {
  if (!raw?.trim()) return { score: 20, host: null as string | null, reason: "missing", publicHttps: false };
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    const privateHost = host === "localhost" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (privateHost) return { score: 10, host, reason: "private-host", publicHttps: false };
    if (url.protocol !== "https:") return { score: 45, host, reason: "not-https", publicHttps: false };
    const highAuthority = host.endsWith(".gov") || host.includes("sec.gov") || host.includes("federalreserve.gov") || host.includes("reuters.com") || host.includes("apnews.com");
    const marketData = host.includes("coinbase.com") || host.includes("kraken.com") || host.includes("binance.com") || host.includes("coingecko.com");
    return { score: highAuthority ? 94 : marketData ? 88 : 78, host, reason: highAuthority ? "high-authority" : marketData ? "market-data" : "public-https", publicHttps: true };
  } catch {
    return { score: 10, host: null as string | null, reason: "invalid-url", publicHttps: false };
  }
}

function settlementLanguage(description?: string | null) {
  const text = description ?? "";
  return {
    hasResolutionRule: /\b(resolve|resolution|settle|settlement|according to|official result)\b/i.test(text),
    hasEdgeCaseRule: /\b(if|otherwise|postpone|cancel|unavailable|tie|recount|invalid|cutoff|deadline)\b/i.test(text),
    length: text.trim().length,
  };
}

function resolutionDimension(context: IntelligenceContext): IntelligenceDimension {
  const source = sourceAssessment(context.resolutionSource);
  const rules = settlementLanguage(context.description);
  let score = source.score;
  if (rules.hasResolutionRule) score += 8;
  if (rules.hasEdgeCaseRule) score += 7;
  if (rules.length === 0) score -= 8;
  score = clamp(score);
  return {
    code: "RESOLUTION_READINESS",
    label: "Resolution readiness",
    score,
    status: statusFor(score),
    summary: score >= 80
      ? "The market has a credible resolution source and useful settlement evidence."
      : score >= 50
        ? "The market can probably resolve, but the source or settlement rules need review."
        : "Resolution evidence is too weak for reliable automated settlement review.",
    evidence: { sourceHost: source.host, sourceReason: source.reason, publicHttps: source.publicHttps, ...rules },
  };
}

function structureDimension(context: IntelligenceContext): IntelligenceDimension {
  const title = context.title.trim();
  const subjectiveTerms = ["best", "worst", "good", "bad", "successful", "major", "significant", "popular", "important", "impressive", "meaningful"];
  const subjective = subjectiveTerms.filter((term) => title.toLowerCase().includes(term));
  const measurable = /\b(reach|exceed|above|below|at least|at most|win|lose|elected|resign|launch|release|close|approve|reject|pass|fail|occur|trade|price|vote|score|announce)\b/i.test(title) || /\d/.test(title);
  let score = 92;
  if (title.length < 15) score -= 30;
  if (title.length > 220) score -= 15;
  if (subjective.length) score -= Math.min(40, subjective.length * 15);
  if (!measurable) score -= 20;
  score = clamp(score);
  return {
    code: "MARKET_STRUCTURE",
    label: "Market structure",
    score,
    status: statusFor(score),
    summary: score >= 80 ? "The market wording is structured around an observable condition." : "The market wording carries ambiguity or weak measurability.",
    evidence: { titleLength: title.length, subjectiveTerms: subjective, measurableConditionDetected: measurable },
  };
}

function dataIntegrityDimension(context: IntelligenceContext): IntelligenceDimension {
  const freshnessBase = { FRESH: 100, AGING: 78, STALE: 35, UNKNOWN: 20 }[context.freshness];
  let score = freshnessBase;
  if (context.source) {
    const sourceFreshness = { FRESH: 100, AGING: 78, STALE: 35, UNKNOWN: 20 }[context.source.freshness];
    score = Math.round(score * 0.55 + sourceFreshness * 0.45);
    score -= Math.min(45, context.source.consecutiveFailures * 12);
  } else {
    score -= 8;
  }
  score = clamp(score);
  return {
    code: "DATA_INTEGRITY",
    label: "Data integrity",
    score,
    status: statusFor(score),
    summary: score >= 80 ? "The persisted market and upstream source are current and healthy." : score >= 50 ? "Data is usable but freshness or source reliability should be watched." : "The market data is too stale or unreliable for normal automated interpretation.",
    evidence: {
      marketFreshness: context.freshness,
      source: context.source?.name ?? null,
      sourceFreshness: context.source?.freshness ?? null,
      consecutiveFailures: context.source?.consecutiveFailures ?? null,
      lastSuccessAt: context.source?.lastSuccessAt ?? null,
      lastError: context.source?.lastError ?? null,
    },
  };
}

function liquidityDimension(context: IntelligenceContext): IntelligenceDimension {
  const liquidity = context.liquidity;
  const volume = context.volume;
  let score = 55;
  if (liquidity != null) {
    if (liquidity <= 0) score = 25;
    else if (liquidity < 100) score = 55;
    else if (liquidity < 1_000) score = 68;
    else if (liquidity < 10_000) score = 82;
    else score = 92;
  }
  if (volume != null && volume > 0) score += volume >= 10_000 ? 6 : volume >= 1_000 ? 3 : 1;
  score = clamp(score);
  return {
    code: "LIQUIDITY_SUPPORT",
    label: "Liquidity support",
    score,
    status: statusFor(score),
    summary: liquidity == null ? "Liquidity is not available from this protocol, so the score is neutral." : score >= 80 ? "Protocol-native liquidity provides strong support for interpreting the quoted probability." : score >= 50 ? "Liquidity is present but should not be treated as deep-market evidence." : "Very low liquidity makes the quoted probability easier to move and less reliable.",
    evidence: { liquidity, volume, note: "Liquidity units are protocol-native and are not directly comparable across protocols." },
  };
}

function historyDimension(context: IntelligenceContext): IntelligenceDimension {
  const snapshots = [...context.snapshots]
    .map((snapshot) => ({ ...snapshot, at: new Date(snapshot.timestamp) }))
    .filter((snapshot) => !Number.isNaN(snapshot.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const probabilities = snapshots.filter((snapshot) => snapshot.probability != null).map((snapshot) => snapshot.probability as number);
  const moves: number[] = [];
  for (let index = 1; index < probabilities.length; index += 1) moves.push(Math.abs(probabilities[index] - probabilities[index - 1]));
  const maxMove = moves.length ? Math.max(...moves) : null;
  const averageMove = moves.length ? moves.reduce((sum, move) => sum + move, 0) / moves.length : null;
  let score = probabilities.length >= 8 ? 92 : probabilities.length >= 4 ? 82 : probabilities.length >= 2 ? 68 : 48;
  if (maxMove != null && maxMove >= 0.4) score -= 20;
  else if (maxMove != null && maxMove >= 0.25) score -= 10;
  score = clamp(score);
  return {
    code: "MARKET_HISTORY",
    label: "Market history",
    score,
    status: statusFor(score),
    summary: probabilities.length < 2 ? "There is not enough persisted probability history for movement analysis." : maxMove != null && maxMove >= 0.25 ? "The market has enough history, but a large single-observation probability move was detected." : "Persisted snapshots provide usable probability history.",
    evidence: { snapshotCount: snapshots.length, probabilityObservations: probabilities.length, maxProbabilityMove: maxMove, averageProbabilityMove: averageMove },
  };
}

function eventContextDimension(context: IntelligenceContext): IntelligenceDimension {
  const canonical = context.canonicalEvent;
  const duplicate = context.duplicateCandidates[0];
  const relationships = context.relationshipCandidates ?? [];
  let score = canonical ? 76 : 45;
  if (canonical?.protocolCount && canonical.protocolCount >= 2) score += 14;
  if (canonical?.marketCount && canonical.marketCount >= 2) score += 5;
  if (duplicate?.similarity && duplicate.similarity >= 0.75) score -= 15;
  if (relationships.some((item) => item.confidence >= 0.62)) score -= 5;
  score = clamp(score);
  return {
    code: "EVENT_CONTEXT",
    label: "Event graph context",
    score,
    status: statusFor(score),
    summary: canonical?.protocolCount && canonical.protocolCount >= 2
      ? "The event graph contains cross-protocol market context."
      : canonical
        ? "The market is attached to a canonical event, but cross-protocol coverage is still limited."
        : "The market is not attached to a canonical event.",
    evidence: {
      canonicalEventId: canonical?.id ?? null,
      marketCount: canonical?.marketCount ?? 0,
      protocolCount: canonical?.protocolCount ?? 0,
      topDuplicate: duplicate ?? null,
      relationshipCandidates: relationships,
    },
  };
}

function consensusDimension(context: IntelligenceContext): IntelligenceDimension {
  const consensus = context.canonicalEvent?.latestConsensus;
  if (!consensus) {
    return {
      code: "CROSS_PROTOCOL_CONSENSUS",
      label: "Cross-protocol consensus",
      score: 55,
      status: "WARN",
      summary: "No consensus snapshot exists yet; this is treated as missing context, not a market failure.",
      evidence: { status: "MISSING" },
    };
  }
  if (consensus.status !== "READY") {
    return {
      code: "CROSS_PROTOCOL_CONSENSUS",
      label: "Cross-protocol consensus",
      score: consensus.status === "STALE" ? 40 : 58,
      status: consensus.status === "STALE" ? "FAIL" : "WARN",
      summary: consensus.status === "STALE" ? "Cross-protocol consensus exists but is stale." : "Fewer than two independent protocol inputs currently support consensus.",
      evidence: { ...consensus },
    };
  }
  const score = clamp(consensus.eventConfidenceScore ?? (consensus.confidence === "HIGH" ? 88 : consensus.confidence === "MEDIUM" ? 70 : 55));
  return {
    code: "CROSS_PROTOCOL_CONSENSUS",
    label: "Cross-protocol consensus",
    score,
    status: statusFor(score),
    summary: score >= 80 ? "Multiple protocol inputs agree strongly enough to provide high-confidence event context." : "Cross-protocol consensus is available, but disagreement reduces confidence.",
    evidence: { ...consensus },
  };
}

export function analyzeMarketIntelligence(context: IntelligenceContext) {
  const dimensions = [
    structureDimension(context),
    resolutionDimension(context),
    dataIntegrityDimension(context),
    liquidityDimension(context),
    historyDimension(context),
    eventContextDimension(context),
    consensusDimension(context),
  ];
  const weights: Record<string, number> = {
    MARKET_STRUCTURE: 15,
    RESOLUTION_READINESS: 25,
    DATA_INTEGRITY: 20,
    LIQUIDITY_SUPPORT: 10,
    MARKET_HISTORY: 10,
    EVENT_CONTEXT: 10,
    CROSS_PROTOCOL_CONSENSUS: 10,
  };
  const totalWeight = dimensions.reduce((sum, dimension) => sum + weights[dimension.code], 0);
  const score = clamp(dimensions.reduce((sum, dimension) => sum + dimension.score * weights[dimension.code], 0) / totalWeight);
  const failed = dimensions.filter((dimension) => dimension.status === "FAIL");
  const warned = dimensions.filter((dimension) => dimension.status === "WARN");
  const status: IntelligenceStatus = failed.some((dimension) => ["RESOLUTION_READINESS", "DATA_INTEGRITY"].includes(dimension.code)) || score < 55
    ? "WEAK"
    : failed.length || warned.length >= 3 || score < 78
      ? "WATCH"
      : "STRONG";

  const evidenceCoverageSignals = [
    Boolean(context.resolutionSource),
    context.snapshots.length >= 2,
    Boolean(context.source),
    context.liquidity != null || context.volume != null,
    Boolean(context.canonicalEvent),
    Boolean(context.canonicalEvent?.latestConsensus),
  ];
  const confidence = clamp(45 + evidenceCoverageSignals.filter(Boolean).length * 9);

  const signals: Array<{ severity: IntelligenceSeverity; code: string; message: string }> = [];
  for (const dimension of dimensions) {
    if (dimension.status === "FAIL") signals.push({ severity: "HIGH", code: dimension.code, message: dimension.summary });
    else if (dimension.status === "WARN") signals.push({ severity: "MEDIUM", code: dimension.code, message: dimension.summary });
  }
  if (signals.length === 0) signals.push({ severity: "INFO", code: "NO_CRITICAL_FINDINGS", message: "No material market-intelligence weakness was detected from the available evidence." });

  const operatorActions = dimensions
    .filter((dimension) => dimension.status !== "PASS")
    .map((dimension) => {
      if (dimension.code === "RESOLUTION_READINESS") return "Review the named resolution source and publish explicit settlement/edge-case rules.";
      if (dimension.code === "DATA_INTEGRITY") return "Check upstream source health before relying on the current market state.";
      if (dimension.code === "LIQUIDITY_SUPPORT") return "Treat the quoted probability cautiously until liquidity improves.";
      if (dimension.code === "MARKET_HISTORY") return "Inspect recent probability moves and confirm they are supported by new information rather than feed anomalies.";
      if (dimension.code === "EVENT_CONTEXT") return "Review duplicate or related-event candidates before creating another market for the same event.";
      if (dimension.code === "CROSS_PROTOCOL_CONSENSUS") return "Do not present a cross-protocol consensus claim until at least two independent protocol inputs are ready.";
      return "Review the market wording and replace subjective language with objective settlement conditions.";
    });

  return {
    marketId: context.marketId,
    protocol: context.protocolName,
    title: context.title,
    score,
    grade: gradeFor(score),
    status,
    confidence,
    resolutionReadiness: dimensions.find((dimension) => dimension.code === "RESOLUTION_READINESS")?.status === "PASS" ? "READY" : "REVIEW",
    dimensions,
    signals,
    operatorActions: [...new Set(operatorActions)],
    duplicateCandidates: context.duplicateCandidates,
    canonicalEvent: context.canonicalEvent,
    algorithmVersion: "market-intelligence-v1",
  };
}

export async function getPersistedMarketIntelligence(marketId: string) {
  const market = await prisma.market.findUnique({
    where: { id: marketId },
    include: {
      snapshots: { orderBy: { timestamp: "desc" }, take: 24 },
      provenance: { orderBy: { retrievedAt: "desc" }, take: 1 },
      canonicalEvent: {
        include: {
          markets: { select: { id: true, protocolName: true } },
          consensusSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!market) return null;

  const sourceName = market.provenance.at(0)?.source;
  const [source, candidates, relationships] = await Promise.all([
    sourceName ? prisma.dataSourceState.findUnique({ where: { source: sourceName } }) : Promise.resolve(null),
    prisma.market.findMany({
      where: { id: { not: market.id } },
      select: { id: true, title: true, protocolName: true },
      orderBy: { updatedAt: "desc" },
      take: 750,
    }),
    market.canonicalEventId
      ? prisma.eventRelationship.findMany({
          where: { OR: [{ sourceEventId: market.canonicalEventId }, { targetEventId: market.canonicalEventId }] },
          orderBy: { confidence: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  const duplicateCandidates = candidates
    .map((candidate) => ({ id: candidate.id, title: candidate.title, protocol: candidate.protocolName, similarity: canonicalTitleSimilarity(market.title, candidate.title) }))
    .filter((candidate) => candidate.similarity >= 0.25)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10);

  const canonicalEvent = market.canonicalEvent
    ? {
        id: market.canonicalEvent.id,
        marketCount: market.canonicalEvent.markets.length,
        protocolCount: new Set(market.canonicalEvent.markets.map((item) => item.protocolName)).size,
        latestConsensus: market.canonicalEvent.consensusSnapshots.at(0) ?? null,
      }
    : null;

  return analyzeMarketIntelligence({
    marketId: market.id,
    title: market.title,
    description: market.description,
    protocolName: market.protocolName,
    status: market.status,
    resolutionSource: market.resolutionSource,
    freshness: market.freshness,
    liquidity: market.liquidity,
    volume: market.volume,
    snapshots: market.snapshots,
    source: source ? {
      name: source.source,
      freshness: source.freshness,
      consecutiveFailures: source.consecutiveFailures,
      lastSuccessAt: source.lastSuccessAt,
      lastError: source.lastError,
    } : null,
    canonicalEvent,
    duplicateCandidates,
    relationshipCandidates: relationships.map((relationship) => ({
      eventId: relationship.sourceEventId === market.canonicalEventId ? relationship.targetEventId : relationship.sourceEventId,
      relationshipType: relationship.relationshipType,
      confidence: relationship.confidence,
      reason: relationship.reason,
    })),
  });
}
