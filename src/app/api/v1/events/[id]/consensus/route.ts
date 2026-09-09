import { getConsensusIntelligence } from "@/lib/consensus-engine";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const intelligence = await getConsensusIntelligence(id);
    if (!intelligence) return Response.json({ error: { message: "Event not found" } }, { status: 404 });
    return Response.json({ data: intelligence });
  } catch (error) {
    return Response.json({ error: { message: "Consensus store unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
