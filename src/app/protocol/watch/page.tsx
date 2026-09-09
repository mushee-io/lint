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
        riskSignals: { orderBy: { detectedAt: "desc" }, take: 8 },
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

  const active = watches.filter((watch) => watch.active).length;
  const high = watches.reduce((sum, watch) => sum + watch.riskSignals.filter((signal) => signal.severity === "HIGH" || signal.severity === "CRITICAL").length, 0);
  const stale = watches.filter((watch) => watch.market.freshness === "STALE" || watch.market.freshness === "UNKNOWN").length;
  const evaluated = watches.filter((watch) => watch.lastEvaluatedAt).length;

  return <main className="min-h-screen bg-white text-zinc-950">
    <header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12">
      <div className="flex flex-wrap gap-4 text-xs"><Link href="/protocol" className="underline">← PROTOCOL</Link><Link href="/protocol/incidents" className="underline">INCIDENT QUEUE</Link></div>
      <p className="mt-12 font-mono text-[10px] tracking-[.18em] text-zinc-500">WATCH V2 / CONTINUOUS SURVEILLANCE</p>
      <h1 className="mt-3 text-5xl tracking-[-.06em] md:text-7xl">Markets don’t stop changing.</h1>
      <p className="mt-5 max-w-3xl text-lg leading-7 text-zinc-600">Watch continuously evaluates probability shocks, liquidity deterioration, stale data, upstream failures, volume acceleration, and resolution-source changes from persisted market state.</p>
    </header>

    <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-4">
      {[["ACTIVE WATCHES", active], ["EVALUATED", evaluated], ["HIGH/CRITICAL SIGNALS", high], ["FRESHNESS RISK", stale]].map(([label, value]) => <div key={String(label)} className="border-b border-zinc-200 p-6 md:border-b-0 md:border-r last:md:border-r-0"><p className="font-mono text-[9px] tracking-[.16em] text-zinc-500">{label}</p><p className="mt-4 text-4xl tracking-[-.06em]">{value}</p></div>)}
    </section>

    <section className="mx-auto max-w-7xl border border-zinc-200 border-t-0">
      {watches.length ? watches.map((watch) => <article key={watch.id} className="border-b border-zinc-200 p-6 md:p-8">
        <div className="grid gap-4 md:grid-cols-[1fr_120px_120px_180px]">
          <div><Link href={`/protocol/markets/${watch.market.id}`} className="text-lg font-medium underline-offset-4 hover:underline">{watch.market.title}</Link><p className="mt-1 font-mono text-[10px] text-zinc-500">{watch.protocol.name} / {watch.market.externalId}</p></div>
          <span className="font-mono text-xs">{watch.active ? "ACTIVE" : "PAUSED"}</span>
          <span className="font-mono text-xs">{watch.market.freshness}</span>
          <span className="font-mono text-[10px] text-zinc-500">{watch.lastEvaluatedAt ? `EVAL ${watch.lastEvaluatedAt.toISOString()}` : "NOT EVALUATED"}</span>
        </div>
        <div className="mt-5 border-t border-zinc-200 pt-4">{watch.riskSignals.length ? watch.riskSignals.map((signal) => <div key={signal.id} className="grid gap-2 border-b border-zinc-100 py-3 text-sm md:grid-cols-[180px_100px_1fr_160px]"><span className="font-mono text-xs">{signal.type}</span><span className="font-mono text-xs">{signal.severity}</span><span>{signal.explanation}</span><span className="font-mono text-[9px] text-zinc-500">{signal.detectedAt.toISOString()}</span></div>) : <p className="text-sm text-zinc-500">NO SIGNALS</p>}</div>
      </article>) : <p className="p-8">NO DATA — no persisted Watch registrations exist for this workspace.</p>}
    </section>
  </main>;
}
