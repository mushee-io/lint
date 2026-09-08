import { AccessError, requireAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

const labels = new Set(["USEFUL", "EXPECTED", "FALSE_POSITIVE", "FALSE_NEGATIVE", "AGREE", "DISAGREE", "UNCERTAIN"]);

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "feedback:read" });
    const items = await prisma.feedback.findMany({ where: { organizationId: context.organizationId }, orderBy: { createdAt: "desc" }, take: 200 });
    return Response.json({ data: items });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Feedback store unavailable" } }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "feedback:write" });
    const body = await request.json();
    if (!body.targetType || !body.targetId || !labels.has(body.label)) return Response.json({ error: { message: "targetType, targetId and a valid label are required" } }, { status: 400 });
    const feedback = await prisma.feedback.create({ data: { organizationId: context.organizationId, targetType: String(body.targetType), targetId: String(body.targetId), label: body.label, comment: typeof body.comment === "string" ? body.comment : undefined, algorithmVersion: typeof body.algorithmVersion === "string" ? body.algorithmVersion : undefined } });
    return Response.json({ data: feedback }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Unable to save feedback" } }, { status: 503 });
  }
}
