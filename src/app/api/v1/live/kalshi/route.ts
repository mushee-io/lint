import { NextResponse } from "next/server";
import { fetchKalshiMarkets } from "@/integrations/kalshi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ data: await fetchKalshiMarkets() });
  } catch (error) {
    return NextResponse.json({ error: { message: "Live Kalshi ingestion unavailable", detail: error instanceof Error ? error.message : "Unknown upstream error" } }, { status: 503 });
  }
}
