import { AccessError, createApiKey, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "api_keys:read", minimumRole: "ADMIN" });
    const keys = await prisma.apiKey.findMany({ where: { organizationId: context.organizationId }, select: { id: true, prefix: true, label: true, permissions: true, environment: true, protocolId: true, revokedAt: true, lastUsedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } });
    return Response.json({ data: keys });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "API key store unavailable" } }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "api_keys:write", minimumRole: "ADMIN" });
    const body = await request.json();
    if (body.protocolId) {
      const protocol = await prisma.protocol.findFirst({ where: { id: String(body.protocolId), organizationId: context.organizationId } });
      if (!protocol) return Response.json({ error: { message: "Protocol not found in this organization" } }, { status: 404 });
    }
    const result = await createApiKey({ organizationId: context.organizationId, protocolId: body.protocolId ? String(body.protocolId) : null, permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : ["*"], environment: body.environment === "live" ? "live" : "sandbox", label: typeof body.label === "string" ? body.label : undefined, actorId: context.actorId });
    return Response.json({ data: { id: result.key.id, prefix: result.key.prefix, secret: result.secret, secretNotice: "Shown once. Store it securely." } }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to create API key" } }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "api_keys:write", minimumRole: "ADMIN" });
    const body = await request.json();
    const result = await prisma.apiKey.updateMany({ where: { id: String(body.id ?? ""), organizationId: context.organizationId }, data: { revokedAt: new Date() } });
    return Response.json({ data: { revoked: result.count } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to revoke API key" } }, { status: 503 });
  }
}
