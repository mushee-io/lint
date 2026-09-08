import { fetchPolymarketMarkets } from "@/integrations/polymarket";
import { ingestPolymarket } from "@/lib/ingestion";
import { configuredSecretMatches } from "@/lib/internal-auth";

export async function GET(request: Request) {
  try {
    const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 10, 1), 100);
    return Response.json({ data: await fetchPolymarketMarkets(limit) });
  } catch (error) {
    return Response.json({ error: { message: "Live Polymarket feed unavailable", detail: error instanceof Error ? error.message : "Unknown upstream error" } }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!configuredSecretMatches(request, "WORKER_SECRET", "x-worker-secret")) return Response.json({ error: { message: "Worker authorization required" } }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    return Response.json({ data: await ingestPolymarket(typeof body.limit === "number" ? body.limit : 50) });
  } catch (error) {
    return Response.json({ error: { message: "Persistent Polymarket ingestion failed", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
