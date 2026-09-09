import { bad, ok } from "@/lib/api";
import { fetchPublicMarketNetwork } from "@/lib/public-markets";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const network = await fetchPublicMarketNetwork(100);
    const market = network.markets.find((candidate) => candidate.id === id || candidate.externalId === id);
    return market ? ok(market) : bad("Market not found", 404);
  } catch (error) {
    return Response.json({ error: { message: "Live market lookup unavailable", detail: error instanceof Error ? error.message : "Unknown upstream error" } }, { status: 503 });
  }
}
