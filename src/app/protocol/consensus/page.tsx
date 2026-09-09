import Link from "next/link";
import { getProtocolReliability } from "@/lib/consensus-engine";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type ConfidenceParts = {
  agreement?: number;
  protocolDiversity?: number;
  sourceReliability?: number;
  freshness?: number;
  liquiditySupport?: number;
  historyDepth?: number;
  total?: number;
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function confidenceParts(value: unknown): ConfidenceParts {
  const root = objectValue(value);
  return objectValue(root.confidenceDecomposition) as ConfidenceParts;
}

function divergenceCount(value: unknown) {
  const root = objectValue(value);
  return Array.isArray(root.divergences) ? root.divergences.filter((item) => {
    const record = objectValue(item);
    return record.severity === "HIGH" || record.severity === "CRITICAL";
  }).length : 0;
}

export default async function ConsensusPage() {
  const events = await prisma.canonicalEvent.findMany({
    include: {
      markets: { select: { id: true, protocolName: true } },
      consensusSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const protocolNames = [...new Set(events.flatMap((event) => event.markets.map((market) => market.protocolName)))].sort();
  const reliability = (await Promise.all(protocolNames.map((protocol) => getProtocolReliability(protocol)))).filter(Boolean);
  const ready = events.filter((event) => event.consensusSnapshots.at(0)?.status === "READY");
  const highDivergence = events.filter((event) => divergenceCount(event.consensusSnapshots.at(0)?.inputs) > 0);
  const averageConfidence = ready.length
    ? Math.round(ready.reduce((sum, event) => sum + (event.consensusSnapshots.at(0)?.eventConfidenceScore ?? 0), 0) / ready.length)
    : null;

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12">
        <div className="flex items-center justify-between gap-4"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><span className="font-mono text-[10px] tracking-[.18em] text-zinc-500">MILESTONE 7 / CONSENSUS V3</span></div>
        <h1 className="mt-14 text-5xl tracking-[-.06em] md:text-7xl">Cross-protocol truth, with uncertainty attached.</h1>
        <p className="mt-5 max-w-3xl text-lg text-zinc-600">Consensus is venue-balanced and reliability-aware. Market Lint never upgrades one venue into consensus and never hides disagreement behind a single probability.</p>
      </header>

      <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-4">
        {[
          ["READY EVENTS", ready.length],
          ["HIGH DIVERGENCE", highDivergence.length],
          ["AVG CONFIDENCE", averageConfidence == null ? "—" : `${averageConfidence}/100`],
          ["OBSERVED PROTOCOLS", protocolNames.length],
        ].map(([label, value]) => <div key={String(label)} className="border-b border-zinc-200 p-6 md:border-b-0 md:border-r"><p className="font-mono text-[10px] tracking-wider text-zinc-500">{label}</p><p className="mt-4 text-4xl tracking-[-.06em]">{value}</p></div>)}
      </section>

      <section className="mx-auto max-w-7xl border-x border-b border-zinc-200 p-8">
        <p className="font-mono text-[10px] tracking-wider text-zinc-500">EVENT CONSENSUS</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="font-mono text-[10px] tracking-wider text-zinc-500"><tr className="border-b border-zinc-300"><th className="py-3 pr-5">EVENT</th><th className="py-3 pr-5">STATUS</th><th className="py-3 pr-5">PROBABILITY</th><th className="py-3 pr-5">CONFIDENCE</th><th className="py-3 pr-5">PROTOCOLS</th><th className="py-3 pr-5">DISPERSION</th><th className="py-3 pr-5">ALERTS</th><th className="py-3">UPDATED</th></tr></thead>
            <tbody>{events.map((event) => {
              const latest = event.consensusSnapshots.at(0);
              const parts = confidenceParts(latest?.inputs);
              return <tr key={event.id} className="border-b border-zinc-200 align-top"><td className="max-w-lg py-4 pr-5"><p className="font-medium">{event.title}</p><p className="mt-1 font-mono text-[10px] text-zinc-400">{event.id}</p></td><td className="py-4 pr-5">{latest?.status ?? "NO DATA"}</td><td className="py-4 pr-5">{latest?.probability == null ? "—" : `${(latest.probability * 100).toFixed(1)}%`}</td><td className="py-4 pr-5"><p>{latest?.confidence ?? "NONE"} {latest?.eventConfidenceScore == null ? "" : `(${latest.eventConfidenceScore})`}</p>{parts.total != null ? <p className="mt-1 font-mono text-[10px] text-zinc-400">agreement {parts.agreement} · source {parts.sourceReliability} · fresh {parts.freshness}</p> : null}</td><td className="py-4 pr-5">{latest?.protocolCount ?? 0}</td><td className="py-4 pr-5">{latest?.dispersion == null ? "—" : `${(latest.dispersion * 100).toFixed(1)}%`}</td><td className="py-4 pr-5">{divergenceCount(latest?.inputs)}</td><td className="py-4 font-mono text-[10px] text-zinc-500">{latest?.createdAt ? latest.createdAt.toISOString() : "—"}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-b border-zinc-200 p-8">
        <p className="font-mono text-[10px] tracking-wider text-zinc-500">PROTOCOL RELIABILITY</p>
        <p className="mt-2 text-sm text-zinc-600">Operational reliability only: source health, freshness and observed history. This is not a moral or governance rating.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">{reliability.map((entry) => entry ? <div key={entry.protocol} className="border border-zinc-200 p-5"><div className="flex items-start justify-between"><h2 className="text-xl">{entry.protocol}</h2><span className="font-mono text-xs">{entry.score}/100</span></div><p className="mt-6 font-mono text-[10px] text-zinc-500">SOURCE {entry.dimensions.sourceHealth} · FRESHNESS {entry.dimensions.freshness} · HISTORY {entry.dimensions.historyDepth}</p><p className="mt-2 text-sm text-zinc-600">{entry.observedMarkets} observed markets · {entry.freshMarkets} fresh</p></div> : null)}</div>
      </section>
    </main>
  );
}
