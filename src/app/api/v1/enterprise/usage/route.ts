import { AccessError, requireAccess } from "@/lib/auth";
import { getTenantUsage } from "@/lib/enterprise";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "enterprise:read" });
    return Response.json({ data: await getTenantUsage(context.organizationId) });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Enterprise usage unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
