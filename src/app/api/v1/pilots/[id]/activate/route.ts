import { AccessError, requireAccess } from "@/lib/auth";
import { activatePartnerPilot } from "@/lib/partner-pilot";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAccess(request, { permission: "pilots:write", minimumRole: "ADMIN" });
    const { id } = await params;
    const activated = await activatePartnerPilot({ pilotId: id, organizationId: context.organizationId, actorId: context.actorId });
    if (!activated) return Response.json({ error: { message: "Pilot not found" } }, { status: 404 });
    return Response.json({ data: activated });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to activate partner pilot", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
