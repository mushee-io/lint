import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "webhooks:write", minimumRole: "DEVELOPER" });
    const body = await request.json();
    const delivery = await prisma.webhookDelivery.findFirst({ where: { id: String(body.deliveryId ?? ""), endpoint: { organizationId: context.organizationId } } });
    if (!delivery) return Response.json({ error: { message: "Delivery not found" } }, { status: 404 });
    const updated = await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "RETRYING", nextAttemptAt: new Date(), lastError: null } });
    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to replay delivery" } }, { status: 503 });
  }
}
