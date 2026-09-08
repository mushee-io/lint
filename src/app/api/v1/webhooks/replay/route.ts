import { AccessError, requireAccess } from "@/lib/auth";
import { replayWebhookDelivery } from "@/lib/webhooks";

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "webhooks:write", minimumRole: "DEVELOPER" });
    const body = await request.json();
    const updated = await replayWebhookDelivery(String(body.deliveryId ?? ""), context.organizationId);
    if (!updated) return Response.json({ error: { message: "Delivery not found" } }, { status: 404 });
    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to replay delivery" } }, { status: 503 });
  }
}
