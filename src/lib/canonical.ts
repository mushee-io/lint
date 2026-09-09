import crypto from "node:crypto";
import { prisma } from "@/lib/db";

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "before", "by", "did", "do", "does", "for", "from", "has", "have", "in", "is", "it", "of", "on", "or", "the", "to", "was", "were", "will", "with"]);
const NEGATIONS = new Set(["not", "no", "never", "without"]);
const TOKEN_ALIASES: Record<string, string> = {
  btc: "bitcoin",
  xbt: "bitcoin",
  eth: "ethereum",
  ether: "ethereum",
  usa: "us",
  u: "us",
};
const ABOVE = new Set(["above", "over", "exceed", "exceeds", "exceeded", "greater", "reach", "reaches", "reached", "hit", "hits"]);
const BELOW = new Set(["below", "under", "less", "lower"]);

export type CanonicalRelationshipType = "SAME_EVENT" | "POSSIBLE_SAME_EVENT" | "RELATED_EVENT" | "UNRELATED";

export type CanonicalRelationshipAssessment = {
  relationshipType: CanonicalRelationshipType;
  confidence: number;
  titleSimilarity: number;
  topicSimilarity: number;
  compatibleNumbers: boolean;
  compatibleNegation: boolean;
  compatibleDirection: boolean;
  reason: string;
  features: {
    leftNumbers: string[];
    rightNumbers: string[];
    leftDirection: string;
    rightDirection: string;
  };
};

export function normalizeCanonicalTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function rawTokens(title: string) {
  return normalizeCanonicalTitle(title).split(/\s+/).filter(Boolean);
}

function normalizeMagnitude(token: string) {
  const match = token.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : match[2] === "b" ? 1_000_000_000 : 1;
  return String(value * multiplier);
}

function tokens(title: string) {
  return rawTokens(title).map((token) => TOKEN_ALIASES[token] ?? token);
}

function significant(title: string) {
  return tokens(title).filter((token) => token.length > 1 && !STOP_WORDS.has(token) && normalizeMagnitude(token) == null);
}

function numericSignature(title: string) {
  return [...new Set(tokens(title).map(normalizeMagnitude).filter((value): value is string => value != null))].sort((a, b) => Number(a) - Number(b));
}

function negationSignature(title: string) {
  return tokens(title).filter((token) => NEGATIONS.has(token)).sort().join("|");
}

function directionSignature(title: string) {
  const ts = tokens(title);
  const above = ts.some((token) => ABOVE.has(token));
  const below = ts.some((token) => BELOW.has(token));
  if (above && below) return "MIXED";
  if (above) return "ABOVE";
  if (below) return "BELOW";
  return "NONE";
}

function jaccard(left: string[], right: string[]) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter((token) => b.has(token)).length / union.size;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function canonicalTitleSimilarity(left: string, right: string) {
  if (normalizeCanonicalTitle(left) === normalizeCanonicalTitle(right)) return 1;
  if (!arraysEqual(numericSignature(left), numericSignature(right))) return 0;
  if (negationSignature(left) !== negationSignature(right)) return 0;
  const leftDirection = directionSignature(left);
  const rightDirection = directionSignature(right);
  if (leftDirection !== "NONE" && rightDirection !== "NONE" && leftDirection !== rightDirection) return 0;
  return jaccard(significant(left), significant(right));
}

export function classifyCanonicalRelationship(left: string, right: string): CanonicalRelationshipAssessment {
  const leftNumbers = numericSignature(left);
  const rightNumbers = numericSignature(right);
  const compatibleNumbers = arraysEqual(leftNumbers, rightNumbers);
  const compatibleNegation = negationSignature(left) === negationSignature(right);
  const leftDirection = directionSignature(left);
  const rightDirection = directionSignature(right);
  const compatibleDirection = leftDirection === "NONE" || rightDirection === "NONE" || leftDirection === rightDirection;
  const topicSimilarity = jaccard(significant(left), significant(right));
  const titleSimilarity = compatibleNumbers && compatibleNegation && compatibleDirection ? canonicalTitleSimilarity(left, right) : 0;

  if (normalizeCanonicalTitle(left) === normalizeCanonicalTitle(right)) {
    return {
      relationshipType: "SAME_EVENT",
      confidence: 1,
      titleSimilarity: 1,
      topicSimilarity: 1,
      compatibleNumbers: true,
      compatibleNegation: true,
      compatibleDirection: true,
      reason: "Normalized market titles are identical.",
      features: { leftNumbers, rightNumbers, leftDirection, rightDirection },
    };
  }

  if (!compatibleNegation) {
    return {
      relationshipType: topicSimilarity >= 0.38 ? "RELATED_EVENT" : "UNRELATED",
      confidence: topicSimilarity,
      titleSimilarity: 0,
      topicSimilarity,
      compatibleNumbers,
      compatibleNegation,
      compatibleDirection,
      reason: "Titles share subject matter but use incompatible negation, so they cannot be grouped as the same event automatically.",
      features: { leftNumbers, rightNumbers, leftDirection, rightDirection },
    };
  }

  if (!compatibleNumbers || !compatibleDirection) {
    return {
      relationshipType: topicSimilarity >= 0.38 ? "RELATED_EVENT" : "UNRELATED",
      confidence: topicSimilarity,
      titleSimilarity: 0,
      topicSimilarity,
      compatibleNumbers,
      compatibleNegation,
      compatibleDirection,
      reason: !compatibleNumbers
        ? "Titles share subject matter but contain different numeric/time conditions."
        : "Titles share subject matter but use incompatible directional conditions.",
      features: { leftNumbers, rightNumbers, leftDirection, rightDirection },
    };
  }

  if (titleSimilarity >= 0.82) {
    return {
      relationshipType: "SAME_EVENT",
      confidence: titleSimilarity,
      titleSimilarity,
      topicSimilarity,
      compatibleNumbers,
      compatibleNegation,
      compatibleDirection,
      reason: "High lexical overlap with compatible numeric, polarity, and directional conditions.",
      features: { leftNumbers, rightNumbers, leftDirection, rightDirection },
    };
  }
  if (titleSimilarity >= 0.60) {
    return {
      relationshipType: "POSSIBLE_SAME_EVENT",
      confidence: titleSimilarity,
      titleSimilarity,
      topicSimilarity,
      compatibleNumbers,
      compatibleNegation,
      compatibleDirection,
      reason: "Material overlap with compatible conditions, but confidence is below the automatic grouping threshold.",
      features: { leftNumbers, rightNumbers, leftDirection, rightDirection },
    };
  }
  if (topicSimilarity >= 0.38) {
    return {
      relationshipType: "RELATED_EVENT",
      confidence: topicSimilarity,
      titleSimilarity,
      topicSimilarity,
      compatibleNumbers,
      compatibleNegation,
      compatibleDirection,
      reason: "Events share material subject matter but are not equivalent enough for consensus grouping.",
      features: { leftNumbers, rightNumbers, leftDirection, rightDirection },
    };
  }
  return {
    relationshipType: "UNRELATED",
    confidence: topicSimilarity,
    titleSimilarity,
    topicSimilarity,
    compatibleNumbers,
    compatibleNegation,
    compatibleDirection,
    reason: "Insufficient evidence that the markets describe the same or materially related event.",
    features: { leftNumbers, rightNumbers, leftDirection, rightDirection },
  };
}

export function deterministicCanonicalEventId(title: string) {
  return `ce_${crypto.createHash("sha256").update(normalizeCanonicalTitle(title)).digest("hex").slice(0, 24)}`;
}

export async function resolveCanonicalEvent(title: string, description?: string, protocolName?: string) {
  const deterministicId = deterministicCanonicalEventId(title);
  const exact = await prisma.canonicalEvent.findUnique({ where: { id: deterministicId } });
  if (exact) return { eventId: exact.id, mode: "EXACT" as const, similarity: 1 };

  const candidates = await prisma.canonicalEvent.findMany({ orderBy: { updatedAt: "desc" }, take: 1000 });
  const ranked = candidates
    .map((event) => ({ event, assessment: classifyCanonicalRelationship(title, event.title) }))
    .filter((candidate) => candidate.assessment.relationshipType !== "UNRELATED")
    .sort((a, b) => b.assessment.confidence - a.assessment.confidence);
  const best = ranked.at(0);

  if (best?.assessment.relationshipType === "SAME_EVENT" && best.assessment.confidence >= 0.90) {
    return { eventId: best.event.id, mode: "AUTO_LINK" as const, similarity: best.assessment.confidence };
  }

  await prisma.canonicalEvent.create({ data: { id: deterministicId, title, description: description || null } });

  if (best && best.event.id !== deterministicId) {
    const relationshipType = best.assessment.relationshipType === "SAME_EVENT" ? "POSSIBLE_SAME_EVENT" : best.assessment.relationshipType;
    const relationshipId = `rel_${crypto.createHash("sha256").update([deterministicId, best.event.id].sort().join(":")) .digest("hex").slice(0, 24)}`;
    await prisma.eventRelationship.upsert({
      where: { id: relationshipId },
      update: {
        relationshipType,
        confidence: best.assessment.confidence,
        reason: `${best.assessment.reason}${protocolName ? ` Source: ${protocolName}.` : ""}`,
      },
      create: {
        id: relationshipId,
        sourceEventId: deterministicId,
        targetEventId: best.event.id,
        relationshipType,
        confidence: best.assessment.confidence,
        reason: `${best.assessment.reason}${protocolName ? ` Source: ${protocolName}.` : ""}`,
      },
    });
  }

  const mode = best?.assessment.relationshipType === "POSSIBLE_SAME_EVENT" || best?.assessment.relationshipType === "SAME_EVENT"
    ? "REVIEW_CANDIDATE" as const
    : best?.assessment.relationshipType === "RELATED_EVENT"
      ? "RELATED" as const
      : "NEW" as const;
  return { eventId: deterministicId, mode, similarity: best?.assessment.confidence ?? 0 };
}
