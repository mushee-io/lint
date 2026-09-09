import { Prisma } from "@/generated/prisma/client";
import { AccessError, requireAccess } from "@/lib/auth";
import { canonicalTitleSimilarity } from "@/lib/canonical";
import { prisma } from "@/lib/db";
import { evaluateGuard, type GuardDuplicateCandidate } from "@/lib/guard-engine";
import { recordPilotMetricForOrganization } from "@/lib/partner-pilot";

const json = (value: unknown) => value as Prisma.InputJsonValue;

function hasAuth(request: Request) {
  return Boolean(request.headers.get("authorization") || request.headers.get("x-api-key") || request.headers.get("x-marketlint-user-id"));
}

function optionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function validateBody(body: unknown) {
  if (!body || typeof body !== "object") return "JSON body is required";
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) return "title is required";
  if (candidate.title.trim().length > 500) return "title must be 500 characters or fewer";
  if (candidate.outcomes !== undefined && !Array.isArray(candidate.outcomes)) return "outcomes must be an array";
  if (Array.isArray(candidate.outcomes) && candidate.outcomes.length > 50) return "outcomes must contain 50 values or fewer";
  return null;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => null);
    const validationError = validateBody(body);
    if (validationError) return Response.json({ error: { message: validationError } }, { status: 400 });

    const input = body as Record<string, unknown>;
    const context = hasAuth(request) ? await requireAccess(request, { permission: "guard:write" }) : null;
    const title = String(input.title).trim();

    const candidates = await prisma.market.findMany({
      select: { id: true, title: true, protocolName: true },
      orderBy: { updatedAt: "desc" },
      take: 750,
    });

    const duplicates: GuardDuplicateCandidate[] = candidates
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        protocol: candidate.protocolName,
        similarity: canonicalTitleSimilarity(title, candidate.title),
      }))
      .filter((candidate) => candidate.similarity >= 0.25)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);

    const evaluation = evaluateGuard({
      title,
      description: optionalString(input.description, 10_000),
      outcomes: Array.isArray(input.outcomes) ? input.outcomes.map(String).map((value) => value.trim()).filter(Boolean) : undefined,
      resolutionSource: optionalString(input.resolutionSource, 2_000),
      closeTime: optionalString(input.closeTime, 200),
    }, duplicates);

    const persisted = await prisma.guardEvaluation.create({
      data: {
        organizationId: context?.organizationId,
        protocolId: context?.protocolId ?? optionalString(input.protocolId, 200),
        marketId: optionalString(input.marketId, 200),
        decision: evaluation.decision,
        marketLintScore: evaluation.marketLintScore,
        duplicateRisk: evaluation.risks.duplicate,
        ambiguityRisk: evaluation.risks.ambiguity,
        resolutionRisk: evaluation.risks.resolution,
        manipulationRisk: evaluation.risks.manipulation,
        warnings: json(evaluation.warnings),
        reasons: json(evaluation.reasons),
        evidence: json({
          ...evaluation.evidence,
          confidence: evaluation.confidence,
          checks: evaluation.checks,
          suggestions: evaluation.suggestions,
        }),
        algorithmVersion: evaluation.algorithmVersion,
      },
    });

    const responseTimeMs = Date.now() - startedAt;
    if (context) {
      await recordPilotMetricForOrganization({
        organizationId: context.organizationId,
        key: "guard.response_ms",
        value: responseTimeMs,
        unit: "ms",
        metadata: { decision: evaluation.decision, score: evaluation.marketLintScore, evaluationId: persisted.id },
      });
    }

    return Response.json({
      data: {
        id: persisted.id,
        ...evaluation,
        responseTimeMs,
        createdAt: persisted.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Persistent Guard unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
