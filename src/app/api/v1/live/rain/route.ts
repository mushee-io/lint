import { fetchRainPartnerMarket } from "@/integrations/rain";
import { evaluateGuard } from "@/lib/guard-engine";

export async function GET(request: Request) {
  try {
    const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 5, 1), 25);
    const live = await fetchRainPartnerMarket(limit);
    const payload = live.payload;
    const guardPreview = evaluateGuard({
      title: payload.title,
      description: payload.description,
      outcomes: payload.outcomes,
      resolutionSource: payload.resolutionSource || undefined,
      closeTime: payload.closeTime || undefined,
    }, []);

    return Response.json({
      data: {
        accepted: true,
        mode: "LIVE_PUBLIC_RAIN",
        protocol: "Rain",
        source: live.source,
        retrievedAt: live.retrievedAt,
        payload,
        guardPreview,
        note: "Read-only public Rain market metadata. No Rain credentials or trading permissions are used.",
      },
    });
  } catch (error) {
    return Response.json({
      error: {
        message: "Live Rain feed unavailable",
        detail: error instanceof Error ? error.message : "Unknown upstream error",
      },
    }, { status: 503 });
  }
}
