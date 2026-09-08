import { runDurableGuard } from "@/lib/intelligence";
import { AccessError, requireAccess } from "@/lib/auth";

function hasAuth(request: Request) {
  return Boolean(request.headers.get("authorization") || request.headers.get("x-api-key") || request.headers.get("x-marketlint-user-id"));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.title || typeof body.title !== "string") return Response.json({ error: { message: "title is required" } }, { status: 400 });
    const context = hasAuth(request) ? await requireAccess(request, { permission: "guard:write" }) : null;
    const result = await runDurableGuard({
      title: body.title,
      description: typeof body.description === "string" ? body.description : undefined,
      outcomes: Array.isArray(body.outcomes) ? body.outcomes.map(String) : undefined,
      resolutionSource: typeof body.resolutionSource === "string" ? body.resolutionSource : undefined,
      closeTime: typeof body.closeTime === "string" ? body.closeTime : undefined,
      marketId: typeof body.marketId === "string" ? body.marketId : undefined,
      organizationId: context?.organizationId,
      protocolId: context?.protocolId ?? (typeof body.protocolId === "string" ? body.protocolId : undefined),
    });
    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Persistent Guard unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
