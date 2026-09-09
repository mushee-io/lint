import { AccessError, requireAccess } from "@/lib/auth";
import { listRelationshipReviewQueue } from "@/lib/event-graph";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAccess(request, { permission: "graph:read" });
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 250);
    const queue = await listRelationshipReviewQueue(limit);
    return Response.json({ data: queue });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Event relationship queue unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
