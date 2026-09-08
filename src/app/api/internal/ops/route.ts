import { configuredSecretMatches } from "@/lib/internal-auth";
import { getOpsStatus } from "@/lib/ops";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!configuredSecretMatches(request, "WORKER_SECRET", "x-worker-secret")) return Response.json({ error: { message: "Operator authorization required" } }, { status: 401 });
  try {
    return Response.json({ data: await getOpsStatus() });
  } catch (error) {
    return Response.json({ error: { message: "Operational status unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
