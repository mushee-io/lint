import { bad, ok } from "@/lib/api";
import { searchPublicMarkets } from "@/lib/public-markets";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    if (typeof query !== "string" || !query.trim()) return bad("query is required");
    const result = await searchPublicMarkets(query.trim(), 50);
    return ok(result.markets);
  } catch (error) {
    return Response.json({ error: { message: "Live market search unavailable", detail: error instanceof Error ? error.message : "Invalid JSON" } }, { status: 503 });
  }
}
