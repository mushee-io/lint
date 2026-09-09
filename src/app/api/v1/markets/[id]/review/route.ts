import { AccessError, requireAccess, type AccessContext } from "@/lib/auth";
import { reviewPersistedMarket } from "@/lib/ai-reviewer";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type ReviewMode = "auto" | "ai" | "deterministic";

function hasAuth(request: Request) {
  return Boolean(request.headers.get("authorization") || request.headers.get("x-api-key") || request.headers.get("x-marketlint-user-id"));
}

function requestedMode(value: unknown): ReviewMode {
  return value === "ai" || value === "deterministic" ? value : "auto";
}

async function persistReview(context: AccessContext | null, marketId: string, review: NonNullable<Awaited<ReturnType<typeof reviewPersistedMarket>>>) {
  if (!context) return null;
  return prisma.auditLog.create({
    data: {
      organizationId: context.organizationId,
      actorType: context.actorType,
      actorId: context.actorId,
      action: "MARKET_AI_REVIEW",
      resourceType: "Market",
      resourceId: marketId,
      metadata: {
        verdict: review.verdict,
        confidence: review.confidence,
        summary: review.summary,
        findings: review.findings,
        suggestedMarketRewrite: review.suggestedMarketRewrite,
        suggestedSettlementRules: review.suggestedSettlementRules,
        operatorActions: review.operatorActions,
        uncertainty: review.uncertainty,
        mode: review.mode,
        providerStatus: review.providerStatus,
        model: review.model,
        grounding: review.grounding,
        generatedAt: review.generatedAt,
      },
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const mode = requestedMode(body && typeof body === "object" ? (body as Record<string, unknown>).mode : undefined);
    const authenticated = hasAuth(request);
    const context = authenticated ? await requireAccess(request, { permission: "intelligence:review" }) : null;

    if (!authenticated && mode === "ai") {
      return Response.json({ error: { message: "Authentication is required to request a paid AI review" } }, { status: 401 });
    }

    // Unauthenticated calls are always deterministic so a public endpoint cannot spend provider credits.
    const useAi = authenticated && mode !== "deterministic";
    const review = await reviewPersistedMarket(id, { useAi });
    if (!review) return Response.json({ error: { message: "Market not found" } }, { status: 404 });

    if (mode === "ai" && review.providerStatus !== "READY") {
      return Response.json({
        error: {
          message: review.providerStatus === "NOT_CONFIGURED"
            ? "AI reviewer is not configured"
            : "AI reviewer provider is temporarily unavailable",
        },
        data: { ...review, reviewId: null },
      }, { status: 503 });
    }

    const audit = await persistReview(context, id, review);
    return Response.json({ data: { ...review, reviewId: audit?.id ?? null } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({
      error: {
        message: "Market reviewer unavailable",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
    }, { status: 503 });
  }
}
