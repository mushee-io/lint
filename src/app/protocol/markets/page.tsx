import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  let markets: Awaited<ReturnType<typeof prisma.market.findMany>> = [];
  let unavailable = false;
  try { markets = await prisma.market.findMany({ orderBy: { lastIngestedAt: "desc" }, take: 100 }); } catch { unavailable = true; }
  return <main className="min-h-screen bg-white"><header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><p className="mt-12 font-mono text-[11px] tracking-widest text-zinc-500">PERSISTED MARKET STATE</p><h1 className="mt-3 text-5xl tracking-[-.06em]">Monitored markets.</h1></header><section className="mx-auto max-w-7xl border border-zinc-200">{unavailable ? <p className="p-8">Database unavailable. No demo rows substituted.</p> : markets.length ? markets.map(m=><div key={m.id} className="grid gap-3 border-b border-zinc-200 p-5 md:grid-cols-[1fr_150px_120px_190px]"><div><p className="text-sm font-medium">{m.title}</p><p className="mt-1 font-mono text-[10px] text-zinc-500">{m.protocolName} / {m.externalId}</p></div><span className="text-sm">{m.freshness}</span><span className="text-sm">{m.status}</span><span className="font-mono text-[10px] text-zinc-500">{m.lastIngestedAt.toISOString()}</span></div>) : <p className="p-8">NO DATA — run persistent ingestion first.</p>}</section></main>;
}
