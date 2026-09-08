import crypto from "node:crypto";
import { prisma } from "@/lib/db";

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "before", "by", "did", "do", "does", "for", "from", "has", "have", "in", "is", "it", "of", "on", "or", "the", "to", "was", "were", "will", "with"]);
const NEGATIONS = new Set(["not", "no", "never", "without"]);

export function normalizeCanonicalTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(title: string) {
  return normalizeCanonicalTitle(title).split(/\s+/).filter(Boolean);
}

function significant(title: string) {
  return tokens(title).filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function numbers(title: string) {
  return tokens(title).filter((token) => /^\d+(?:\.\d+)?$/.test(token));
}

function negationSignature(title: string) {
  return significant(title).filter((token) => NEGATIONS.has(token)).sort().join("|");
}

function jaccard(left: string[], right: string[]) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter((token) => b.has(token)).length / union.size;
}

export function canonicalTitleSimilarity(left: string, right: string) {
  if (normalizeCanonicalTitle(left) === normalizeCanonicalTitle(right)) return 1;
  const leftNumbers = numbers(left).join("|");
  const rightNumbers = numbers(right).join("|");
  if (leftNumbers !== rightNumbers) return 0;
  if (negationSignature(left) !== negationSignature(right)) return 0;
  return jaccard(significant(left), significant(right));
}

export function deterministicCanonicalEventId(title: string) {
  return `ce_${crypto.createHash("sha256").update(normalizeCanonicalTitle(title)).digest("hex").slice(0, 24)}`;
}

export async function resolveCanonicalEvent(title: string, description?: string, protocolName?: string) {
  const deterministicId = deterministicCanonicalEventId(title);
  const exact = await prisma.canonicalEvent.findUnique({ where: { id: deterministicId } });
  if (exact) return { eventId: exact.id, mode: "EXACT" as const, similarity: 1 };

  const candidates = await prisma.canonicalEvent.findMany({
    include: { markets: { select: { protocolName: true }, take: 10 } },
    orderBy: { updatedAt: "desc" },
    take: 1000,
  });

  const ranked = candidates
    .map((event) => ({ event, similarity: canonicalTitleSimilarity(title, event.title) }))
    .filter((candidate) => candidate.similarity >= 0.62)
    .sort((a, b) => b.similarity - a.similarity);
  const best = ranked.at(0);

  if (best && best.similarity >= 0.86) {
    return { eventId: best.event.id, mode: "AUTO_LINK" as const, similarity: best.similarity };
  }

  await prisma.canonicalEvent.create({
    data: { id: deterministicId, title, description: description || null },
  });

  if (best && best.similarity >= 0.62 && best.event.id !== deterministicId) {
    const relationshipId = `rel_${crypto.createHash("sha256").update([deterministicId, best.event.id].sort().join(":")) .digest("hex").slice(0, 24)}`;
    await prisma.eventRelationship.upsert({
      where: { id: relationshipId },
      update: { confidence: best.similarity, reason: `Conservative title similarity candidate${protocolName ? ` from ${protocolName}` : ""}; human review required before consensus grouping.` },
      create: {
        id: relationshipId,
        sourceEventId: deterministicId,
        targetEventId: best.event.id,
        relationshipType: "POSSIBLE_SAME_EVENT",
        confidence: best.similarity,
        reason: `Conservative title similarity candidate${protocolName ? ` from ${protocolName}` : ""}; human review required before consensus grouping.`,
      },
    });
  }

  return { eventId: deterministicId, mode: best ? "REVIEW_CANDIDATE" as const : "NEW" as const, similarity: best?.similarity ?? 0 };
}
