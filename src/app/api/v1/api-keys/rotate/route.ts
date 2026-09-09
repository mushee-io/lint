import { AccessError, createApiKey, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "api_keys:write", minimumRole: "ADMIN" });
    const body = await request.json();
    const existing = await prisma.apiKey.findFirst({
      where: { id: String(body.id ?? ""), organizationId: context.organizationId, revokedAt: null },
    });
    if (!existing) return Response.json({ error: { message: "Active API key not found" } }, { status: 404 });

    const replacement = await createApiKey({
      organizationId: context.organizationId,
      protocolId: existing.protocolId,
      permissions: existing.permissions,
      environment: existing.environment === "live" ? "live" : "sandbox",
      label: existing.label ? `${existing.label} (rotated)` : "Rotated key",
      actorId: context.actorId,
    });

    await prisma.$transaction([
      prisma.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorType: context.actorType,
          actorId: context.actorId,
          action: "API_KEY_ROTATED",
          resourceType: "ApiKey",
          resourceId: replacement.key.id,
          metadata: { previousKeyId: existing.id, previousPrefix: existing.prefix, replacementPrefix: replacement.key.prefix },
        },
      }),
    ]);

    return Response.json({
      data: {
        id: replacement.key.id,
        prefix: replacement.key.prefix,
        secret: replacement.secret,
        revokedKeyId: existing.id,
        secretNotice: "Shown once. Store it securely.",
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to rotate API key", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
