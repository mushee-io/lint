import { configuredSecretMatches } from "@/lib/internal-auth";
import { runWorkerBatch } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!configuredSecretMatches(request, "WORKER_SECRET", "x-worker-secret")) return Response.json({ error: { message: "Worker authorization required" } }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const maxJobs = Math.min(Math.max(Number(body.maxJobs) || 20, 1), 100);
    return Response.json({ data: { jobs: await runWorkerBatch(maxJobs), ranAt: new Date().toISOString() } });
  } catch (error) {
    return Response.json({ error: { message: "Worker batch failed", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
