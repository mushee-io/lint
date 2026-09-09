import Link from "next/link";
import { GraphReviewActions } from "@/components/protocol/graph-review-actions";
import { prisma } from "@/lib/db";
import { listRelationshipReviewQueue } from "@/lib/event-graph";

export const dynamic = "force-dynamic";

export default async function EventGraphPage() {
  const organizationId = process.env.MARKET_LINT_PILOT_ORG_ID;
  if (!organizationId) {
    return <main className="min-h-screen bg-white p-10"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><h1 className="mt-12 text-5xl tracking-[-.06em]">Event Graph is not exposed.</h1><p className="mt-5 text-zinc-600">Configure MARKET_LINT_PILOT_ORG_ID for the pilot operator workspace.</p></main>;
  }

  const [queue, eventCount, relationshipCounts, recentEvents] = await Promise.all([
    listRelationshipReviewQueue(50),
    prisma.canonicalEvent.count(),
    prisma.eventRelationship.groupBy({ by: ["relationshipType"], _count: { _all: true } }),
    prisma.canonicalEvent.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { markets: { select: { protocolName: true } } },
    }),
  ]);
  const counts = new Map(relationshipCounts.map((row) => [row.relationshipType, row._count._all]));
  const multiProtocol = recentEvents.filter((event) => new Set(event.markets.map((market) => market.protocolName)).size >= 2).length;

  return <main className="min-h-screen bg-white text-zinc-950">
    <header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12">
      <div className="flex flex-wrap items-center justify-between gap-4"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><span className="font-mono text-[10px] tracking-[.16em] text-zinc-500">MILESTONE 6 / UNIVERSAL EVENT GRAPH</span></div>
      <p className="mt-14 font-mono text-[10px] tracking-[.18em] text-zinc-500">CANONICAL EVENT REVIEW</p>
      <h1 className="mt-3 text-5xl tracking-[-.065em] md:text-7xl">One event. Many markets.</h1>
      <p className="mt-5 max-w-3xl text-lg leading-7 text-zinc-600">Market Lint maps differently worded markets to canonical real-world events, automatically groups only high-confidence equivalents, and keeps uncertain matches in a human review queue.</p>
    </header>

    <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-5">
      {[
        ["CANONICAL EVENTS", eventCount],
        ["REVIEW QUEUE", queue.length],
        ["CONFIRMED LINKS", counts.get("SAME_EVENT_CONFIRMED") ?? 0],
        ["RELATED EDGES", counts.get("RELATED_EVENT") ?? 0],
        ["MULTI-PROTOCOL / RECENT", multiProtocol],
      ].map(([label, value]) => <div key={String(label)} className="border-b border-zinc-200 p-6 md:border-b-0 md:border-r last:md:border-r-0"><p className="font-mono text-[9px] tracking-[.16em] text-zinc-500">{label}</p><p className="mt-4 text-4xl tracking-[-.06em]">{value}</p></div>)}
    </section>

    <section className="mx-auto max-w-7xl border-x border-zinc-200 p-8">
      <div className="flex items-end justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[.18em] text-zinc-500">POSSIBLE SAME EVENT</p><h2 className="mt-2 text-3xl tracking-[-.05em]">Human review queue</h2></div><p className="max-w-lg text-right text-xs leading-5 text-zinc-500">Confirming a relationship joins the events into the graph-aware consensus cluster. It does not rewrite third-party source data.</p></div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {queue.length ? queue.map((item) => <article key={item.id} className="border border-zinc-200 p-5">
          <div className="flex items-center justify-between gap-4"><span className="font-mono text-[10px]">{item.relationshipType}</span><span className="font-mono text-xs">{Math.round(item.confidence * 100)}%</span></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div><p className="font-mono text-[9px] text-zinc-500">SOURCE EVENT</p><p className="mt-2 text-sm font-medium leading-5">{item.sourceEvent?.title ?? item.sourceEventId}</p><p className="mt-2 font-mono text-[9px] text-zinc-500">{item.sourceEvent ? [...new Set(item.sourceEvent.markets.map((market) => market.protocolName))].join(" · ") || "NO MARKETS" : "MISSING"}</p></div>
            <div><p className="font-mono text-[9px] text-zinc-500">TARGET EVENT</p><p className="mt-2 text-sm font-medium leading-5">{item.targetEvent?.title ?? item.targetEventId}</p><p className="mt-2 font-mono text-[9px] text-zinc-500">{item.targetEvent ? [...new Set(item.targetEvent.markets.map((market) => market.protocolName))].join(" · ") || "NO MARKETS" : "MISSING"}</p></div>
          </div>
          <p className="mt-5 border-l-2 border-zinc-950 pl-3 text-xs leading-5 text-zinc-600">{item.reason}</p>
          <GraphReviewActions relationshipId={item.id} />
        </article>) : <div className="border border-zinc-200 p-8 text-sm text-zinc-500">No possible-same-event relationships currently require review.</div>}
      </div>
    </section>

    <section className="mx-auto max-w-7xl border border-zinc-200">
      <div className="border-b border-zinc-200 p-6"><p className="font-mono text-[10px] tracking-[.18em] text-zinc-500">RECENT CANONICAL EVENTS</p></div>
      {recentEvents.map((event) => {
        const protocols = [...new Set(event.markets.map((market) => market.protocolName))];
        return <Link href={`/api/v1/events/${event.id}/graph`} key={event.id} className="grid gap-3 border-b border-zinc-200 p-5 hover:bg-zinc-50 md:grid-cols-[1fr_120px_1fr_160px] md:items-center"><span className="text-sm font-medium">{event.title}</span><span className="font-mono text-[10px]">{event.markets.length} MARKETS</span><span className="font-mono text-[10px] text-zinc-500">{protocols.join(" · ") || "NO PROTOCOL"}</span><span className="font-mono text-[9px] text-zinc-500">{event.updatedAt.toISOString()}</span></Link>;
      })}
    </section>
  </main>;
}
