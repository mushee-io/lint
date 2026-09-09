import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    const events = await prisma.canonicalEvent.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        _count: { select: { markets: true, consensusSnapshots: true } },
        markets: { select: { protocolName: true } },
      },
    });
    return Response.json({ data: events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      marketCount: event._count.markets,
      consensusSnapshotCount: event._count.consensusSnapshots,
      protocols: [...new Set(event.markets.map((market) => market.protocolName))],
    })) });
  } catch (error) {
    return Response.json({ error: { message: "Event graph store unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
