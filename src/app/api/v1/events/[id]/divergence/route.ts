import { getConsensusIntelligence } from "@/lib/consensus-engine";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const intelligence = await getConsensusIntelligence(id);
    if (!intelligence) return Response.json({ error: { message: "Event not found" } }, { status: 404 });
    return Response.json({
      data: {
        canonicalEventId: id,
        status: intelligence.latest.status,
        dispersion: intelligence.latest.dispersion,
        divergences: intelligence.divergences,
        confidenceDecomposition: intelligence.confidenceDecomposition,
        algorithmVersion: intelligence.latest.algorithmVersion,
        updatedAt: "createdAt" in intelligence.latest && intelligence.latest.createdAt ? intelligence.latest.createdAt : null,
      },
    });
  } catch (error) {
    return Response.json({ error: { message: "Divergence intelligence unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
