import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "watch:read" });
    const watches = await prisma.watchRegistration.findMany({
      where: { organizationId: context.organizationId },
      include: { market: true, protocol: true },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ data: watches });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Watch store unavailable" } }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "watch:write", minimumRole: "DEVELOPER" });
    const body = await request.json();
    if (!body?.marketId) return Response.json({ error: { message: "marketId is required" } }, { status: 400 });
    const protocolId = context.protocolId ?? body.protocolId;
    if (!protocolId) return Response.json({ error: { message: "protocolId is required" } }, { status: 400 });
    const [market, protocol] = await Promise.all([
      prisma.market.findUnique({ where: { id: body.marketId } }),
      prisma.protocol.findFirst({ where: { id: protocolId, organizationId: context.organizationId } }),
    ]);
    if (!market) return Response.json({ error: { message: "Market not found" } }, { status: 404 });
    if (!protocol) return Response.json({ error: { message: "Protocol not found in this organization" } }, { status: 404 });
    const watch = await prisma.watchRegistration.upsert({
      where: { organizationId_marketId: { organizationId: context.organizationId, marketId: market.id } },
      update: { protocolId: protocol.id, active: true },
      create: { organizationId: context.organizationId, protocolId: protocol.id, marketId: market.id },
    });
    return Response.json({ data: watch }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to create Watch registration", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "watch:write", minimumRole: "DEVELOPER" });
    const body = await request.json();
    if (!body?.marketId) return Response.json({ error: { message: "marketId is required" } }, { status: 400 });
    const result = await prisma.watchRegistration.updateMany({ where: { organizationId: context.organizationId, marketId: body.marketId }, data: { active: false } });
    return Response.json({ data: { deactivated: result.count } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to update Watch registration" } }, { status: 503 });
  }
}
