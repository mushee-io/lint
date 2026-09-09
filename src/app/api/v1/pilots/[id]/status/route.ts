import { AccessError, requireAccess } from "@/lib/auth";
import { getPartnerPilotStatus } from "@/lib/partner-pilot";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAccess(request, { permission: "pilots:read" });
    const { id } = await params;
    const status = await getPartnerPilotStatus(id, context.organizationId);
    if (!status) return Response.json({ error: { message: "Pilot not found" } }, { status: 404 });
    return Response.json({ data: status });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Partner pilot status unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
