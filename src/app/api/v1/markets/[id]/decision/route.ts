import { Prisma } from "@/generated/prisma/client";
import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPersistedMarketIntelligence } from "@/lib/market-intelligence";

export const dynamic = "force-dynamic";

type OperatorDecision = "APPROVE" | "HOLD" | "REJECT";

function parseDecision(value: unknown): OperatorDecision | null {
  return value === "APPROVE" || value === "HOLD" || value === "REJECT" ? value : null;
}

function optionalNote(value: unknown) {
  if (typeof value !== "string") return null;
  const note = value.trim();
  return note ? note.slice(0, 2_000) : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAccess(request, { permission: "operator:decision" });
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: { message: "JSON body is required" } }, { status: 400 });
    }

    const record = body as Record<string, unknown>;
    const decision = parseDecision(record.decision);
    if (!decision) {
      return Response.json({ error: { message: "decision must be APPROVE, HOLD, or REJECT" } }, { status: 400 });
    }

    const [market, intelligence] = await Promise.all([
      prisma.market.findUnique({ where: { id }, select: { id: true, title: true, protocolName: true } }),
      getPersistedMarketIntelligence(id),
    ]);
    if (!market || !intelligence) {
      return Response.json({ error: { message: "Market not found" } }, { status: 404 });
    }

    const note = optionalNote(record.note);
    const action = `MARKET_${decision}`;
    const audit = await prisma.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorType: context.actorType,
        actorId: context.actorId,
        action,
        resourceType: "Market",
        resourceId: market.id,
        metadata: {
          decision,
          note,
          marketTitle: market.title,
          protocol: market.protocolName,
          intelligenceScore: intelligence.score,
          intelligenceGrade: intelligence.grade,
          intelligenceStatus: intelligence.status,
          intelligenceConfidence: intelligence.confidence,
          resolutionReadiness: intelligence.resolutionReadiness,
          algorithmVersion: intelligence.algorithmVersion,
        } as Prisma.InputJsonValue,
      },
    });

    return Response.json({
      data: {
        id: audit.id,
        marketId: market.id,
        decision,
        note,
        intelligence: {
          score: intelligence.score,
          grade: intelligence.grade,
          status: intelligence.status,
          confidence: intelligence.confidence,
        },
        createdAt: audit.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return Response.json({ error: { message: error.message } }, { status: error.status });
    }
    return Response.json({
      error: {
        message: "Operator decision unavailable",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
    }, { status: 503 });
  }
}
