import { getPersistentEventGraph } from "@/lib/event-graph";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const graph = await getPersistentEventGraph(id);
    if (!graph) return Response.json({ error: { message: "Event not found" } }, { status: 404 });
    return Response.json({ data: graph });
  } catch (error) {
    return Response.json({ error: { message: "Event graph unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
