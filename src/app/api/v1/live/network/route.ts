import { NextResponse } from "next/server";
import { fetchPublicMarketNetwork } from "@/lib/public-markets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const data = await fetchPublicMarketNetwork(Number.isFinite(limit) ? limit : 20);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (error) {
    return NextResponse.json({ error: { message: "Live public market network unavailable", detail: error instanceof Error ? error.message : "Unknown upstream error" } }, { status: 503 });
  }
}
