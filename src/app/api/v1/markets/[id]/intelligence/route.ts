import { getPersistedMarketIntelligence } from "@/lib/market-intelligence";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const intelligence = await getPersistedMarketIntelligence(id);
    if (!intelligence) return Response.json({ error: { message: "Market not found" } }, { status: 404 });
    return Response.json({ data: intelligence });
  } catch (error) {
    return Response.json({
      error: {
        message: "Market intelligence unavailable",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
    }, { status: 503 });
  }
}
