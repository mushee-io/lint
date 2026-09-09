import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPersistedMarketIntelligence } from "@/lib/market-intelligence";

export const dynamic = "force-dynamic";

const freshnessValues = new Set(["FRESH", "AGING", "STALE", "UNKNOWN"]);
const intelligenceValues = new Set(["STRONG", "WATCH", "WEAK"]);

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function decisionLabel(action?: string) {
  return action ? action.replace("MARKET_", "") : "UNDECIDED";
}

export default async function OperatorDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const q = one(query.q)?.trim().slice(0, 120) ?? "";
  const protocol = one(query.protocol)?.trim().slice(0, 80) ?? "";
  const freshness = one(query.freshness)?.trim().toUpperCase() ?? "";
  const intelligenceFilter = one(query.intelligence)?.trim().toUpperCase() ?? "";
  const pilotOrgId = process.env.MARKET_LINT_PILOT_ORG_ID?.trim();

  const markets = await prisma.market.findMany({
    where: {
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      ...(protocol ? { protocolName: protocol } : {}),
      ...(freshnessValues.has(freshness) ? { freshness: freshness as "FRESH" | "AGING" | "STALE" | "UNKNOWN" } : {}),
    },
    orderBy: { lastIngestedAt: "desc" },
    take: 36,
    select: {
      id: true,
      externalId: true,
      protocolName: true,
      title: true,
      freshness: true,
      status: true,
      liquidity: true,
      volume: true,
      lastIngestedAt: true,
    },
  });

  const analyses = (await Promise.all(markets.map(async (market) => ({
    market,
    intelligence: await getPersistedMarketIntelligence(market.id),
  })))).filter((row): row is typeof row & { intelligence: NonNullable<typeof row.intelligence> } => Boolean(row.intelligence));

  const filtered = analyses
    .filter((row) => intelligenceValues.has(intelligenceFilter) ? row.intelligence.status === intelligenceFilter : true)
    .sort((a, b) => {
      const rank = { WEAK: 0, WATCH: 1, STRONG: 2 } as const;
      return rank[a.intelligence.status] - rank[b.intelligence.status] || a.intelligence.score - b.intelligence.score;
    });

  const marketIds = filtered.map((row) => row.market.id);
  const decisionLogs = pilotOrgId && marketIds.length ? await prisma.auditLog.findMany({
    where: {
      organizationId: pilotOrgId,
      resourceType: "Market",
      resourceId: { in: marketIds },
      action: { in: ["MARKET_APPROVE", "MARKET_HOLD", "MARKET_REJECT"] },
    },
    orderBy: { createdAt: "desc" },
  }) : [];
  const latestDecision = new Map<string, { action: string; createdAt: Date }>();
  for (const item of decisionLogs) {
    if (item.resourceId && !latestDecision.has(item.resourceId)) latestDecision.set(item.resourceId, { action: item.action, createdAt: item.createdAt });
  }

  const protocols = await prisma.market.findMany({ distinct: ["protocolName"], select: { protocolName: true }, orderBy: { protocolName: "asc" } });
  const metrics = {
    total: filtered.length,
    weak: filtered.filter((row) => row.intelligence.status === "WEAK").length,
    watch: filtered.filter((row) => row.intelligence.status === "WATCH").length,
    stale: filtered.filter((row) => row.market.freshness === "STALE" || row.market.freshness === "UNKNOWN").length,
    undecided: filtered.filter((row) => !latestDecision.has(row.market.id)).length,
  };

  return <main className="min-h-screen bg-white text-zinc-950">
    <header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/protocol" className="text-sm underline">← PROTOCOL</Link>
        <span className="font-mono text-[10px] tracking-[.16em] text-zinc-500">MILESTONE 4 / OPERATOR DASHBOARD</span>
      </div>
      <p className="mt-14 font-mono text-[10px] tracking-[.18em] text-zinc-500">REVIEW QUEUE</p>
      <h1 className="mt-3 text-5xl tracking-[-.065em] md:text-7xl">Decide what ships.</h1>
      <p className="mt-5 max-w-3xl text-lg leading-7 text-zinc-600">Live markets ranked by Market Lint intelligence. Weak, stale, ambiguous, and unresolved markets rise to the top. No AI call is made just by opening this dashboard.</p>
    </header>

    <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-5">
      {[
        ["IN QUEUE", metrics.total],
        ["WEAK", metrics.weak],
        ["WATCH", metrics.watch],
        ["FRESHNESS RISK", metrics.stale],
        ["UNDECIDED", metrics.undecided],
      ].map(([label, value]) => <div key={String(label)} className="border-b border-zinc-200 p-6 md:border-b-0 md:border-r last:md:border-r-0"><p className="font-mono text-[9px] tracking-[.16em] text-zinc-500">{label}</p><p className="mt-4 text-4xl tracking-[-.06em]">{value}</p></div>)}
    </section>

    <section className="mx-auto max-w-7xl border-x border-zinc-200 p-6">
      <form className="grid gap-3 md:grid-cols-[1fr_180px_160px_170px_auto]">
        <input name="q" defaultValue={q} placeholder="Search market title…" className="border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950" />
        <select name="protocol" defaultValue={protocol} className="border border-zinc-300 bg-white px-3 py-2 text-sm">
          <option value="">All protocols</option>
          {protocols.map((item) => <option key={item.protocolName} value={item.protocolName}>{item.protocolName}</option>)}
        </select>
        <select name="freshness" defaultValue={freshness} className="border border-zinc-300 bg-white px-3 py-2 text-sm">
          <option value="">All freshness</option>
          {Array.from(freshnessValues).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select name="intelligence" defaultValue={intelligenceFilter} className="border border-zinc-300 bg-white px-3 py-2 text-sm">
          <option value="">All intelligence</option>
          {Array.from(intelligenceValues).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <button className="bg-zinc-950 px-5 py-2 text-sm text-white">FILTER</button>
      </form>
      {(q || protocol || freshness || intelligenceFilter) ? <div className="mt-3"><Link href="/protocol/operator" className="font-mono text-[10px] underline">CLEAR FILTERS</Link></div> : null}
    </section>

    <section className="mx-auto max-w-7xl border border-zinc-200">
      <div className="hidden grid-cols-[90px_92px_110px_1fr_105px_105px_120px] gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-3 font-mono text-[9px] tracking-[.12em] text-zinc-500 md:grid">
        <span>SCORE</span><span>STATUS</span><span>PROTOCOL</span><span>MARKET</span><span>FRESHNESS</span><span>DECISION</span><span>UPDATED</span>
      </div>
      {filtered.length ? filtered.map(({ market, intelligence }) => {
        const decision = latestDecision.get(market.id);
        return <Link href={`/protocol/markets/${market.id}`} key={market.id} className="grid gap-3 border-b border-zinc-200 p-5 transition-colors hover:bg-zinc-50 md:grid-cols-[90px_92px_110px_1fr_105px_105px_120px] md:items-center">
          <div><span className="md:hidden font-mono text-[9px] text-zinc-500">SCORE </span><span className="text-2xl tracking-[-.05em]">{intelligence.score}</span><span className="ml-1 font-mono text-[9px] text-zinc-500">{intelligence.grade}</span></div>
          <span className="font-mono text-[10px]">{intelligence.status}</span>
          <span className="text-xs">{market.protocolName}</span>
          <div><p className="text-sm font-medium leading-5">{market.title}</p><p className="mt-1 line-clamp-1 text-xs text-zinc-500">{intelligence.signals.at(0)?.message ?? "No material finding"}</p></div>
          <span className="font-mono text-[10px]">{market.freshness}</span>
          <span className={decision ? "font-mono text-[10px] font-semibold" : "font-mono text-[10px] text-zinc-400"}>{decisionLabel(decision?.action)}</span>
          <span className="font-mono text-[9px] text-zinc-500">{market.lastIngestedAt.toISOString().slice(0, 16).replace("T", " ")}</span>
        </Link>;
      }) : <p className="p-8 text-sm text-zinc-500">No markets match this operator queue.</p>}
    </section>

    <footer className="mx-auto max-w-7xl border-x border-zinc-200 p-8 text-xs leading-5 text-zinc-500">
      Operator decisions require an API key with <code className="font-mono text-zinc-900">operator:decision</code>. AI review requires <code className="font-mono text-zinc-900">intelligence:review</code>. Decision history is shown only for the configured pilot organization.
    </footer>
  </main>;
}
