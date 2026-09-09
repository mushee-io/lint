import { evaluateGuard } from "@/lib/guard-engine";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: { message: "JSON object required" } }, { status: 400 });
    const market = body as Record<string, unknown>;
    const externalId = typeof market.externalId === "string" ? market.externalId.trim() : typeof market.id === "string" ? market.id.trim() : "";
    const title = typeof market.title === "string" ? market.title.trim() : "";
    if (!externalId || !title) return Response.json({ error: { message: "externalId (or id) and title are required" } }, { status: 400 });
    const outcomes = Array.isArray(market.outcomes) ? market.outcomes.map(String).map((value) => value.trim()).filter(Boolean) : ["YES", "NO"];
    const probability = Number(market.probability);
    const prices = Array.isArray(market.prices)
      ? market.prices.map(Number).filter(Number.isFinite)
      : Number.isFinite(probability) && probability >= 0 && probability <= 1
        ? [probability, 1 - probability]
        : [];
    const normalized = {
      externalId,
      title,
      description: typeof market.description === "string" ? market.description.trim() : "",
      outcomes,
      closeTime: typeof market.closeTime === "string" ? market.closeTime : "",
      resolutionSource: typeof market.resolutionSource === "string" ? market.resolutionSource : "",
      prices,
      liquidity: Number.isFinite(Number(market.liquidity)) ? Math.max(0, Number(market.liquidity)) : 0,
      volume: Number.isFinite(Number(market.volume)) ? Math.max(0, Number(market.volume)) : 0,
      status: market.status === "CLOSED" || market.status === "RESOLVED" ? market.status : "OPEN",
    };
    const guard = evaluateGuard({
      title: normalized.title,
      description: normalized.description,
      outcomes: normalized.outcomes,
      resolutionSource: normalized.resolutionSource || undefined,
      closeTime: normalized.closeTime || undefined,
    }, []);
    return Response.json({
      data: {
        accepted: true,
        mode: "VALIDATION_ONLY",
        normalized,
        guardPreview: guard,
        next: "For a live pilot, Market Lint issues a tenant-scoped API key and accepts batches at POST /api/v1/partner/markets.",
      },
    });
  } catch {
    return Response.json({ error: { message: "Invalid JSON" } }, { status: 400 });
  }
}
