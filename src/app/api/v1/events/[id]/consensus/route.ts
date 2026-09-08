import { prisma } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const event = await prisma.canonicalEvent.findUnique({ where: { id } });
    if (!event) return Response.json({ error: { message: "Event not found" } }, { status: 404 });
    const history = await prisma.consensusSnapshot.findMany({ where: { canonicalEventId: id }, orderBy: { createdAt: "desc" }, take: 25 });
    return Response.json({ data: { canonicalEventId: id, latest: history.at(0) ?? { status: "INSUFFICIENT_DATA", probability: null, protocolCount: 0, marketCount: 0 }, history } });
  } catch (error) {
    return Response.json({ error: { message: "Consensus store unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
