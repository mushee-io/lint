import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createWebhookEndpoint } from "@/lib/webhooks";

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "webhooks:read" });
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { organizationId: context.organizationId }, select: { id: true, url: true, description: true, active: true, createdAt: true, updatedAt: true } });
    return Response.json({ data: endpoints });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Webhook store unavailable" } }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "webhooks:write", minimumRole: "DEVELOPER" });
    const body = await request.json();
    if (!body?.url) return Response.json({ error: { message: "url is required" } }, { status: 400 });
    const result = await createWebhookEndpoint({ organizationId: context.organizationId, url: String(body.url), description: typeof body.description === "string" ? body.description : undefined });
    return Response.json({ data: { ...result.endpoint, secret: result.secret, secretNotice: "Shown once. Store it securely." } }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to create webhook", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "webhooks:write", minimumRole: "DEVELOPER" });
    const body = await request.json();
    const result = await prisma.webhookEndpoint.updateMany({ where: { id: String(body.id ?? ""), organizationId: context.organizationId }, data: { active: false } });
    return Response.json({ data: { deactivated: result.count } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to deactivate webhook" } }, { status: 503 });
  }
}
