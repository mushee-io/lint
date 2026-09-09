import { getProtocolReliability } from "@/lib/consensus-engine";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reliability = await getProtocolReliability(decodeURIComponent(id));
    if (!reliability) return Response.json({ error: { message: "Protocol not found in persisted market data" } }, { status: 404 });
    return Response.json({ data: reliability });
  } catch (error) {
    return Response.json({ error: { message: "Protocol reliability unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
