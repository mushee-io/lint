import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

const statuses = new Set(["INVITED", "SANDBOX", "INTEGRATING", "LIVE_TEST", "PILOT_ACTIVE", "REVIEW", "PRODUCTION_READY", "ENDED"]);

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "pilots:read" });
    const pilots = await prisma.pilot.findMany({ where: { organizationId: context.organizationId }, include: { protocol: true }, orderBy: { createdAt: "desc" } });
    return Response.json({ data: pilots });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Pilot store unavailable" } }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "pilots:write", minimumRole: "ADMIN" });
    const body = await request.json();
    const protocol = await prisma.protocol.findFirst({ where: { id: String(body.protocolId ?? context.protocolId ?? ""), organizationId: context.organizationId } });
    if (!protocol) return Response.json({ error: { message: "Protocol not found in this organization" } }, { status: 404 });
    const pilot = await prisma.pilot.create({ data: { organizationId: context.organizationId, protocolId: protocol.id, name: typeof body.name === "string" ? body.name : `${protocol.name} pilot`, status: "INVITED" } });
    return Response.json({ data: pilot }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to create pilot" } }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "pilots:write", minimumRole: "ADMIN" });
    const body = await request.json();
    if (!statuses.has(body.status)) return Response.json({ error: { message: "Invalid pilot status" } }, { status: 400 });
    const existing = await prisma.pilot.findFirst({ where: { id: String(body.id ?? ""), organizationId: context.organizationId } });
    if (!existing) return Response.json({ error: { message: "Pilot not found" } }, { status: 404 });
    const pilot = await prisma.pilot.update({ where: { id: existing.id }, data: { status: body.status, startedAt: body.status === "PILOT_ACTIVE" && !existing.startedAt ? new Date() : undefined, endedAt: body.status === "ENDED" ? new Date() : undefined } });
    return Response.json({ data: pilot });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to update pilot" } }, { status: 503 });
  }
}
