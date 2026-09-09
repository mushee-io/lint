import { AccessError, requireAccess } from "@/lib/auth";
import { ingestPartnerMarkets } from "@/lib/partner-pilot";

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "partner:ingest" });
    if (!context.protocolId) return Response.json({ error: { message: "Partner API key must be bound to a protocol" } }, { status: 400 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return Response.json({ error: { message: "JSON body is required" } }, { status: 400 });
    const record = body as Record<string, unknown>;
    const markets = Array.isArray(record.markets) ? record.markets.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
    if (!markets.length) return Response.json({ error: { message: "markets must contain at least one market object" } }, { status: 400 });
    const result = await ingestPartnerMarkets({ organizationId: context.organizationId, protocolId: context.protocolId, actorId: context.actorId, markets, autoWatch: record.autoWatch !== false });
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Partner feed ingestion failed", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 400 });
  }
}
