import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const event = await prisma.canonicalEvent.findUnique({
      where: { id },
      include: {
        markets: { orderBy: { lastIngestedAt: "desc" }, take: 100 },
        consensusSnapshots: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!event) return Response.json({ error: { message: "Event not found" } }, { status: 404 });
    const relationships = await prisma.eventRelationship.findMany({
      where: { OR: [{ sourceEventId: id }, { targetEventId: id }] },
      orderBy: { confidence: "desc" },
    });
    return Response.json({ data: { ...event, relationships } });
  } catch (error) {
    return Response.json({ error: { message: "Event graph store unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
