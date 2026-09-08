import { NextResponse } from "next/server";
import { fetchManifoldMarkets } from "@/integrations/manifold";

export async function GET() {
  try {
    return NextResponse.json({ data: await fetchManifoldMarkets() });
  } catch (error) {
    return NextResponse.json({ error: { message: "Live Manifold ingestion unavailable", detail: error instanceof Error ? error.message : "Unknown upstream error" } }, { status: 503 });
  }
}
