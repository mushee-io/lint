import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "webhooks:read" });
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const [activeEndpoints, delivered, pending, retrying, deadLetter, recent] = await Promise.all([
      prisma.webhookEndpoint.count({ where: { organizationId: context.organizationId, active: true } }),
      prisma.webhookDelivery.count({ where: { endpoint: { organizationId: context.organizationId }, status: "DELIVERED", createdAt: { gte: since } } }),
      prisma.webhookDelivery.count({ where: { endpoint: { organizationId: context.organizationId }, status: "PENDING" } }),
      prisma.webhookDelivery.count({ where: { endpoint: { organizationId: context.organizationId }, status: "RETRYING" } }),
      prisma.webhookDelivery.count({ where: { endpoint: { organizationId: context.organizationId }, status: "DEAD_LETTER" } }),
      prisma.webhookDelivery.findMany({
        where: { endpoint: { organizationId: context.organizationId } },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { id: true, endpointId: true, eventType: true, status: true, attemptCount: true, responseStatus: true, lastError: true, deliveredAt: true, createdAt: true },
      }),
    ]);
    const attempted24h = delivered + recent.filter((item) => item.createdAt >= since && item.status !== "DELIVERED").length;
    return Response.json({
      data: {
        activeEndpoints,
        last24h: {
          delivered,
          attempted: attempted24h,
          successRate: attempted24h ? delivered / attempted24h : null,
        },
        queue: { pending, retrying, deadLetter },
        recent,
        measuredAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Webhook statistics unavailable" } }, { status: 503 });
  }
}
