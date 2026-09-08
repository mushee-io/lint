import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "signals:read" });
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    const signals = await prisma.riskSignal.findMany({ where: { organizationId: context.organizationId }, orderBy: { detectedAt: "desc" }, take: limit });
    return Response.json({ data: signals });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Signal store unavailable" } }, { status: 503 });
  }
}
