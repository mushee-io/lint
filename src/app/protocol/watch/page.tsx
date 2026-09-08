import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function loadWatches(organizationId: string) {
  try {
    return await prisma.watchRegistration.findMany({
      where: { organizationId },
      include: {
        market: true,
        protocol: true,
        riskSignals: { orderBy: { detectedAt: "desc" }, take: 3 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  } catch {
    return null;
  }
}

export default async function WatchPage() {
  const organizationId = process.env.MARKET_LINT_PILOT_ORG_ID;
  if (!organizationId) {
    return <main className="min-h-screen bg-white p-10"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><h1 className="mt-12 text-5xl tracking-[-.06em]">Watch is not exposed.</h1><p className="mt-5 text-zinc-600">Configure MARKET_LINT_PILOT_ORG_ID for the authenticated pilot workspace.</p></main>;
  }
  const watches = await loadWatches(organizationId);
  if (!watches) return <main className="min-h-screen bg-white p-10">Watch database unavailable. No demo rows substituted.</main>;
  return <main className="min-h-screen bg-white"><header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><p className="mt-12 font-mono text-[11px] tracking-widest text-zinc-500">DURABLE WATCH</p><h1 className="mt-3 text-5xl tracking-[-.06em]">Persisted monitoring.</h1></header><section className="mx-auto max-w-7xl border border-zinc-200">{watches.length ? watches.map((watch) => <article key={watch.id} className="border-b border-zinc-200 p-6"><div className="grid gap-4 md:grid-cols-[1fr_140px_160px]"><div><p className="text-lg font-medium">{watch.market.title}</p><p className="mt-1 font-mono text-[10px] text-zinc-500">{watch.protocol.name} / {watch.market.externalId}</p></div><span className="font-mono text-xs">{watch.active ? "ACTIVE" : "PAUSED"}</span><span className="font-mono text-xs">{watch.market.freshness}</span></div><div className="mt-5 border-t border-zinc-200 pt-4">{watch.riskSignals.length ? watch.riskSignals.map((signal) => <div key={signal.id} className="grid gap-2 py-2 text-sm md:grid-cols-[140px_100px_1fr]"><span className="font-mono text-xs">{signal.type}</span><span className="font-mono text-xs">{signal.severity}</span><span>{signal.explanation}</span></div>) : <p className="text-sm text-zinc-500">NO SIGNALS</p>}</div></article>) : <p className="p-8">NO DATA — no persisted Watch registrations exist for this workspace.</p>}</section></main>;
}
