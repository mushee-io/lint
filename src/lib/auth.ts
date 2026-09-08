import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export type OrganizationRole = "OWNER" | "ADMIN" | "DEVELOPER" | "ANALYST" | "VIEWER";
export type AccessContext = {
  organizationId: string;
  protocolId?: string | null;
  actorType: "API_KEY" | "USER";
  actorId: string;
  role?: OrganizationRole;
  permissions: string[];
};

const roleRank: Record<OrganizationRole, number> = {
  VIEWER: 1,
  ANALYST: 2,
  DEVELOPER: 3,
  ADMIN: 4,
  OWNER: 5,
};

export class AccessError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

export function hashSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function bearer(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-api-key")?.trim() ?? null;
}

function permissionAllowed(granted: string[], required?: string) {
  if (!required) return true;
  return granted.includes("*") || granted.includes(required);
}

export async function requireAccess(request: Request, options: { permission?: string; minimumRole?: OrganizationRole } = {}): Promise<AccessContext> {
  const token = bearer(request);
  if (token) {
    const key = await prisma.apiKey.findUnique({ where: { hash: hashSecret(token) } });
    if (!key || key.revokedAt) throw new AccessError("Invalid or revoked API key", 401);
    if (!permissionAllowed(key.permissions, options.permission)) throw new AccessError("API key lacks required permission", 403);
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return {
      organizationId: key.organizationId,
      protocolId: key.protocolId,
      actorType: "API_KEY",
      actorId: key.id,
      permissions: key.permissions,
    };
  }

  const userId = request.headers.get("x-marketlint-user-id");
  const organizationId = request.headers.get("x-marketlint-organization-id");
  if (!userId || !organizationId) throw new AccessError("Authentication required", 401);

  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!membership) throw new AccessError("Organization membership required", 403);
  const role = membership.role as OrganizationRole;
  if (options.minimumRole && roleRank[role] < roleRank[options.minimumRole]) {
    throw new AccessError(`${options.minimumRole} role or higher required`, 403);
  }

  return {
    organizationId,
    actorType: "USER",
    actorId: userId,
    role,
    permissions: ["*"],
  };
}

export async function createApiKey(input: {
  organizationId: string;
  protocolId?: string | null;
  permissions?: string[];
  environment?: "sandbox" | "live";
  label?: string;
  actorId?: string;
}) {
  const environment = input.environment ?? "sandbox";
  const secret = `ml_${environment}_${crypto.randomBytes(24).toString("base64url")}`;
  const key = await prisma.apiKey.create({
    data: {
      organizationId: input.organizationId,
      protocolId: input.protocolId ?? null,
      prefix: secret.slice(0, 18),
      hash: hashSecret(secret),
      permissions: input.permissions?.length ? input.permissions : ["*"],
      environment,
      label: input.label,
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorType: "SYSTEM",
      actorId: input.actorId,
      action: "API_KEY_CREATED",
      resourceType: "ApiKey",
      resourceId: key.id,
      metadata: { prefix: key.prefix, environment },
    },
  });
  return { key, secret };
}

export function accessErrorResponse(error: unknown) {
  if (error instanceof AccessError) {
    return Response.json({ error: { message: error.message } }, { status: error.status });
  }
  throw error;
}
