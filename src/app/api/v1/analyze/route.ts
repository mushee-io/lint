import { bad, ok } from "@/lib/api";
import { analyzeAgainstPublicMarkets } from "@/lib/public-markets";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.title) return bad("title is required");
    return ok(await analyzeAgainstPublicMarkets({
      title: String(body.title),
      description: typeof body.description === "string" ? body.description : undefined,
      outcomes: Array.isArray(body.outcomes) ? body.outcomes.map(String) : undefined,
      resolution: typeof body.resolution === "string" ? body.resolution : undefined,
      source: typeof body.source === "string" ? body.source : undefined,
    }));
  } catch (error) {
    return Response.json({ error: { message: "Live market analysis unavailable", detail: error instanceof Error ? error.message : "Invalid JSON" } }, { status: 503 });
  }
}
