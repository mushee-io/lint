import { AccessError, requireAccess } from "@/lib/auth";
import { listIncidents } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "incidents:read" });
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200);
    const status = url.searchParams.get("status")?.toUpperCase() ?? undefined;
    const severity = url.searchParams.get("severity")?.toUpperCase() ?? undefined;
    const incidents = await listIncidents(context.organizationId, { limit, status, severity });
    return Response.json({ data: incidents });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Incident queue unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
