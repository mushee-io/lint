import { AccessError, requireAccess } from "@/lib/auth";
import { decideEventRelationship, RelationshipDecision } from "@/lib/event-graph";

export const dynamic = "force-dynamic";

function parseDecision(value: unknown): RelationshipDecision | null {
  return value === "CONFIRM_SAME_EVENT" || value === "MARK_RELATED" || value === "REJECT" ? value : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAccess(request, { permission: "graph:write", minimumRole: "ANALYST" });
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return Response.json({ error: { message: "JSON body is required" } }, { status: 400 });
    const record = body as Record<string, unknown>;
    const decision = parseDecision(record.decision);
    if (!decision) return Response.json({ error: { message: "decision must be CONFIRM_SAME_EVENT, MARK_RELATED, or REJECT" } }, { status: 400 });
    const note = typeof record.note === "string" ? record.note : null;

    const relationship = await decideEventRelationship({
      relationshipId: id,
      decision,
      organizationId: context.organizationId,
      actorType: context.actorType,
      actorId: context.actorId,
      note,
    });
    if (!relationship) return Response.json({ error: { message: "Event relationship not found" } }, { status: 404 });
    return Response.json({ data: relationship });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Event relationship decision unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
