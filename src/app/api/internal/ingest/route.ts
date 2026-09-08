import { ingestManifold, ingestPolymarket } from "@/lib/ingestion";
import { configuredSecretMatches } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!configuredSecretMatches(request, "WORKER_SECRET", "x-worker-secret")) {
    return Response.json({ error: { message: "Worker authorization required" } }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);

  const results = await Promise.allSettled([
    ingestPolymarket(limit),
    ingestManifold(limit),
  ]);

  const sources = results.map((result, index) => {
    const source = index === 0 ? "polymarket-gamma" : "manifold-v0";
    if (result.status === "fulfilled") return { source, ok: true, data: result.value };
    return {
      source,
      ok: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  const ok = sources.every((source) => source.ok);
  return Response.json(
    { data: { ok, ranAt: new Date().toISOString(), sources } },
    { status: ok ? 200 : 207 },
  );
}
