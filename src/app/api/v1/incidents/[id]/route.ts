import { Prisma } from "@/generated/prisma/client";
import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type IncidentAction = "ACKNOWLEDGE" | "RESOLVE" | "REOPEN";

function parseAction(value: unknown): IncidentAction | null {
  return value === "ACKNOWLEDGE" || value === "RESOLVE" || value === "REOPEN" ? value : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAccess(request, { permission: "incidents:write", minimumRole: "ANALYST" });
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return Response.json({ error: { message: "JSON body is required" } }, { status: 400 });
    const record = body as Record<string, unknown>;
    const action = parseAction(record.action);
    if (!action) return Response.json({ error: { message: "action must be ACKNOWLEDGE, RESOLVE, or REOPEN" } }, { status: 400 });
    const note = typeof record.note === "string" && record.note.trim() ? record.note.trim().slice(0, 2_000) : null;

    const signal = await prisma.riskSignal.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!signal) return Response.json({ error: { message: "Incident not found" } }, { status: 404 });
    const responseTimeMs = Math.max(0, Date.now() - signal.detectedAt.getTime());

    const audit = await prisma.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorType: context.actorType,
        actorId: context.actorId,
        action: action === "ACKNOWLEDGE" ? "INCIDENT_ACKNOWLEDGED" : action === "RESOLVE" ? "INCIDENT_RESOLVED" : "INCIDENT_REOPENED",
        resourceType: "RiskSignal",
        resourceId: signal.id,
        metadata: {
          note,
          signalType: signal.type,
          severity: signal.severity,
          marketId: signal.marketId,
          algorithmVersion: signal.algorithmVersion,
          responseTimeMs,
        } as Prisma.InputJsonValue,
      },
    });

    return Response.json({ data: { id: signal.id, action, note, responseTimeMs, recordedAt: audit.createdAt.toISOString() } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Incident action unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
