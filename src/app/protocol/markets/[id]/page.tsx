import Link from "next/link";
import { notFound } from "next/navigation";
import { OperatorActions } from "@/components/protocol/operator-actions";
import { reviewPersistedMarket } from "@/lib/ai-reviewer";
import { prisma } from "@/lib/db";
import { getPersistedMarketIntelligence } from "@/lib/market-intelligence";

export const dynamic = "force-dynamic";

function display(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function decisionLabel(action: string) {
  return action.replace("MARKET_", "");
}

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pilotOrgId = process.env.MARKET_LINT_PILOT_ORG_ID?.trim();

  const [market, intelligence, review, decisions, reviewHistory] = await Promise.all([
    prisma.market.findUnique({
      where: { id },
      include: {
        snapshots: { orderBy: { timestamp: "desc" }, take: 12 },
        provenance: { orderBy: { retrievedAt: "desc" }, take: 5 },
        canonicalEvent: true,
      },
    }),
    getPersistedMarketIntelligence(id),
    reviewPersistedMarket(id, { useAi: false }),
    pilotOrgId ? prisma.auditLog.findMany({
      where: {
        organizationId: pilotOrgId,
        resourceType: "Market",
        resourceId: id,
        action: { in: ["MARKET_APPROVE", "MARKET_HOLD", "MARKET_REJECT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }) : Promise.resolve([]),
    pilotOrgId ? prisma.auditLog.findMany({
      where: {
        organizationId: pilotOrgId,
        resourceType: "Market",
        resourceId: id,
        action: "MARKET_AI_REVIEW",
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }) : Promise.resolve([]),
  ]);

  if (!market || !intelligence || !review) notFound();
  const latestDecision = decisions.at(0);
  const evidenceRows: Array<[string, unknown]> = [
    ["Resolution source", market.resolutionSource],
    ["Liquidity", market.liquidity],
    ["Volume", market.volume],
    ["Outcomes", market.outcomes],
    ["Canonical event", market.canonicalEvent?.id],
    ["Last ingested", market.lastIngestedAt.toISOString()],
  ];

  return <main className="min-h-screen bg-white text-zinc-950">
    <header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12">
      <div className="flex flex-wrap gap-4 text-xs">
        <Link href="/protocol/operator" className="underline">← OPERATOR QUEUE</Link>
        <Link href="/protocol/markets" className="underline">ALL MARKETS</Link>
      </div>
      <p className="mt-12 font-mono text-[10px] tracking-[.18em] text-zinc-500">{market.protocolName.toUpperCase()} / {market.externalId}</p>
      <h1 className="mt-3 max-w-5xl text-4xl tracking-[-.055em] md:text-6xl">{market.title}</h1>
      <div className="mt-7 flex flex-wrap gap-2 font-mono text-[10px]">
        <span className="border border-zinc-300 px-3 py-2">{market.freshness}</span>
        <span className="border border-zinc-300 px-3 py-2">{market.status}</span>
        <span className="border border-zinc-300 px-3 py-2">INTELLIGENCE {intelligence.status}</span>
        <span className="border border-zinc-300 px-3 py-2">GRADE {intelligence.grade}</span>
        {latestDecision ? <span className="bg-zinc-950 px-3 py-2 text-white">OPERATOR {decisionLabel(latestDecision.action)}</span> : <span className="border border-zinc-300 px-3 py-2">UNDECIDED</span>}
      </div>
    </header>

    <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-4">
      {[
        ["INTELLIGENCE SCORE", intelligence.score],
        ["CONFIDENCE", intelligence.confidence],
        ["RESOLUTION", intelligence.resolutionReadiness],
        ["REVIEW VERDICT", review.verdict],
      ].map(([label, value]) => <div key={String(label)} className="border-b border-zinc-200 p-6 md:border-b-0 md:border-r last:md:border-r-0"><p className="font-mono text-[9px] tracking-[.16em] text-zinc-500">{label}</p><p className="mt-4 text-3xl tracking-[-.05em]">{value}</p></div>)}
    </section>

    <section className="mx-auto grid max-w-7xl border-x border-zinc-200 lg:grid-cols-[1.35fr_.65fr]">
      <div className="border-b border-zinc-200 p-8 lg:border-b-0 lg:border-r">
        <p className="font-mono text-[10px] tracking-[.18em] text-zinc-500">MARKET INTELLIGENCE</p>
        <div className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200">
          {intelligence.dimensions.map((dimension) => <div key={dimension.code} className="grid gap-3 py-5 md:grid-cols-[160px_80px_90px_1fr] md:items-start">
            <p className="text-sm font-medium">{dimension.label}</p>
            <p className="font-mono text-xs">{dimension.score}/100</p>
            <p className="font-mono text-xs">{dimension.status}</p>
            <div><p className="text-sm leading-6 text-zinc-600">{dimension.summary}</p><details className="mt-2"><summary className="cursor-pointer font-mono text-[9px] text-zinc-500">EVIDENCE</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap bg-zinc-50 p-3 text-[10px] leading-5">{JSON.stringify(dimension.evidence, null, 2)}</pre></details></div>
          </div>)}
        </div>
      </div>

      <aside className="p-8">
        <p className="font-mono text-[10px] tracking-[.18em] text-zinc-500">GROUNDED REVIEW</p>
        <p className="mt-4 text-2xl tracking-[-.04em]">{review.verdict}</p>
        <p className="mt-4 text-sm leading-6 text-zinc-600">{review.summary}</p>
        {review.findings.length ? <div className="mt-6 space-y-4">{review.findings.map((finding) => <div key={finding.code} className="border-l-2 border-zinc-950 pl-4"><p className="font-mono text-[9px] text-zinc-500">{finding.severity} / {finding.code}</p><p className="mt-1 text-sm font-medium">{finding.title}</p><p className="mt-1 text-xs leading-5 text-zinc-600">{finding.explanation}</p></div>)}</div> : <p className="mt-5 text-sm">No material deterministic findings.</p>}
        {review.suggestedMarketRewrite ? <div className="mt-7 border-t border-zinc-200 pt-5"><p className="font-mono text-[9px] text-zinc-500">SUGGESTED REWRITE</p><p className="mt-2 text-sm leading-6">{review.suggestedMarketRewrite}</p></div> : null}
      </aside>
    </section>

    <section className="mx-auto max-w-7xl border border-zinc-200">
      <OperatorActions marketId={market.id} />
    </section>

    <section className="mx-auto grid max-w-7xl border-x border-zinc-200 lg:grid-cols-2">
      <div className="border-b border-zinc-200 p-8 lg:border-b-0 lg:border-r">
        <p className="font-mono text-[10px] tracking-[.18em] text-zinc-500">MARKET EVIDENCE</p>
        <dl className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200 text-sm">
          {evidenceRows.map(([label, value]) => <div key={label} className="grid gap-2 py-3 md:grid-cols-[150px_1fr]"><dt className="text-zinc-500">{label}</dt><dd className="break-words font-mono text-xs">{display(value)}</dd></div>)}
        </dl>
        {market.description ? <div className="mt-5"><p className="text-xs text-zinc-500">Description</p><p className="mt-2 text-sm leading-6">{market.description}</p></div> : null}
      </div>
      <div className="p-8">
        <p className="font-mono text-[10px] tracking-[.18em] text-zinc-500">RECENT SNAPSHOTS</p>
        <div className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200">{market.snapshots.map((snapshot) => <div key={snapshot.id} className="grid grid-cols-4 gap-2 py-3 font-mono text-[10px]"><span>{snapshot.timestamp.toISOString()}</span><span>P {display(snapshot.probability)}</span><span>L {display(snapshot.liquidity)}</span><span>V {display(snapshot.volume)}</span></div>)}</div>
      </div>
    </section>

    <section className="mx-auto grid max-w-7xl border border-zinc-200 lg:grid-cols-2">
      <div className="border-b border-zinc-200 p-8 lg:border-b-0 lg:border-r">
        <p className="font-mono text-[10px] tracking-[.18em] text-zinc-500">OPERATOR DECISION HISTORY</p>
        {pilotOrgId ? decisions.length ? <div className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200">{decisions.map((item) => {
          const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata as Record<string, unknown> : {};
          return <div key={item.id} className="py-4"><div className="flex items-center justify-between gap-4"><span className="font-mono text-xs">{decisionLabel(item.action)}</span><span className="font-mono text-[9px] text-zinc-500">{item.createdAt.toISOString()}</span></div>{metadata.note ? <p className="mt-2 text-sm text-zinc-600">{String(metadata.note)}</p> : null}</div>;
        })}</div> : <p className="mt-5 text-sm text-zinc-500">No operator decision recorded for the configured pilot organization.</p> : <p className="mt-5 text-sm text-zinc-500">Set MARKET_LINT_PILOT_ORG_ID to show tenant-scoped decision history.</p>}
      </div>
      <div className="p-8">
        <p className="font-mono text-[10px] tracking-[.18em] text-zinc-500">AI REVIEW HISTORY</p>
        {pilotOrgId ? reviewHistory.length ? <div className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200">{reviewHistory.map((item) => {
          const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata as Record<string, unknown> : {};
          return <div key={item.id} className="py-4"><div className="flex items-center justify-between"><span className="font-mono text-xs">{String(metadata.verdict ?? "REVIEW")}</span><span className="font-mono text-[9px] text-zinc-500">{item.createdAt.toISOString()}</span></div><p className="mt-2 text-xs leading-5 text-zinc-600">{String(metadata.summary ?? "Persisted review")}</p></div>;
        })}</div> : <p className="mt-5 text-sm text-zinc-500">No authenticated AI review has been persisted yet.</p> : <p className="mt-5 text-sm text-zinc-500">Tenant-scoped review history is hidden until a pilot organization is configured.</p>}
      </div>
    </section>
  </main>;
}
