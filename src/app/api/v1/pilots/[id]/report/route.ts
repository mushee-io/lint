import { AccessError, requireAccess } from "@/lib/auth";
import { generatePilotReport, getPilotMetrics } from "@/lib/pilots";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAccess(request, { permission: "pilots:read" });
    const { id } = await params;
    const url = new URL(request.url);
    if (url.searchParams.get("generate") === "1") {
      const report = await generatePilotReport(id, context.organizationId);
      return report ? Response.json({ data: report }) : Response.json({ error: { message: "Pilot not found" } }, { status: 404 });
    }
    const metrics = await getPilotMetrics(id, context.organizationId);
    return metrics ? Response.json({ data: metrics }) : Response.json({ error: { message: "Pilot not found" } }, { status: 404 });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Pilot report unavailable" } }, { status: 503 });
  }
}
