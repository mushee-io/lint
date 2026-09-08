import { createApiKey } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { configuredSecretMatches } from "@/lib/internal-auth";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export async function POST(request: Request) {
  if (!configuredSecretMatches(request, "BOOTSTRAP_SECRET", "x-bootstrap-secret")) return Response.json({ error: { message: "Bootstrap authorization required" } }, { status: 401 });
  try {
    const body = await request.json();
    if (!body?.name || !body?.email) return Response.json({ error: { message: "name and email are required" } }, { status: 400 });
    const slug = slugify(typeof body.slug === "string" ? body.slug : body.name);
    if (!slug) return Response.json({ error: { message: "A valid organization slug is required" } }, { status: 400 });
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email: String(body.email).toLowerCase() }, update: {}, create: { email: String(body.email).toLowerCase() } });
      const organization = await tx.organization.create({ data: { name: String(body.name), slug } });
      await tx.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
      const protocol = body.protocolName ? await tx.protocol.create({ data: { organizationId: organization.id, name: String(body.protocolName), status: "SANDBOX" } }) : null;
      return { user, organization, protocol };
    });
    const apiKey = await createApiKey({ organizationId: created.organization.id, protocolId: created.protocol?.id, environment: "sandbox", permissions: ["*"], label: "Bootstrap key", actorId: created.user.id });
    return Response.json({ data: { ...created, apiKey: apiKey.secret, apiKeyPrefix: apiKey.key.prefix, apiKeyNotice: "Shown once. Store it securely." } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: { message: "Organization bootstrap failed", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 400 });
  }
}
