import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "protocols:read" });
    const protocols = await prisma.protocol.findMany({ where: { organizationId: context.organizationId }, orderBy: { createdAt: "desc" } });
    return Response.json({ data: protocols });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Protocol store unavailable" } }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "protocols:write", minimumRole: "DEVELOPER" });
    const body = await request.json();
    if (!body?.name) return Response.json({ error: { message: "name is required" } }, { status: 400 });
    const protocol = await prisma.protocol.create({ data: { organizationId: context.organizationId, name: String(body.name), externalId: typeof body.externalId === "string" ? body.externalId : undefined, sourceName: typeof body.sourceName === "string" ? body.sourceName : undefined, status: typeof body.status === "string" ? body.status : "SANDBOX" } });
    return Response.json({ data: protocol }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to create protocol", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 400 });
  }
}
