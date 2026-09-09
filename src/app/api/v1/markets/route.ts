import { ok } from "@/lib/api";
import { fetchPublicMarketNetwork } from "@/lib/public-markets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const network = await fetchPublicMarketNetwork(30);
    return ok(network.markets);
  } catch (error) {
    return Response.json({ error: { message: "Live public markets unavailable", detail: error instanceof Error ? error.message : "Unknown upstream error" } }, { status: 503 });
  }
}
