import Link from "next/link";
import { buildValidationReport } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function loadValidation() {
  try {
    return await buildValidationReport();
  } catch {
    return null;
  }
}

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

export default async function ValidationPage() {
  const report = await loadValidation();
  if (!report) {
    return <main className="min-h-screen bg-white p-10">Production validation unavailable. No synthetic metrics substituted.</main>;
  }

  const cells = [
    ["STAGE", report.validation.stage],
    ["ASSESSMENT", report.validation.assessment],
    ["OBSERVED", `${report.scheduler.observedHours}H`],
    ["24H COVERAGE", percent(report.scheduler.coverage24h)],
    ["MAX GAP", report.scheduler.maxGapMinutes === null ? "—" : `${report.scheduler.maxGapMinutes}M`],
    ["MARKETS", report.data.markets],
  ];

  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12">
        <Link href="/protocol" className="text-sm underline">← PROTOCOL</Link>
        <p className="mt-12 font-mono text-[11px] tracking-widest text-zinc-500">PRODUCTION VALIDATION / 24–72 HOURS</p>
        <h1 className="mt-3 text-5xl tracking-[-.06em]">Evidence, not claims.</h1>
        <p className="mt-5 max-w-3xl text-zinc-600">This page is generated from persisted production scheduler heartbeats, source state, worker state, webhook delivery state and live market data.</p>
      </header>

      <section className="mx-auto grid max-w-7xl border border-zinc-200 md:grid-cols-3 lg:grid-cols-6">
        {cells.map(([label, value]) => (
          <div key={String(label)} className="border-b border-r border-zinc-200 p-6">
            <p className="font-mono text-[10px] tracking-wider text-zinc-500">{label}</p>
            <p className="mt-4 text-2xl tracking-[-.04em]">{value}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto grid max-w-7xl border-x border-b border-zinc-200 md:grid-cols-2">
        <div className="border-b border-zinc-200 p-8 md:border-b-0 md:border-r">
          <p className="font-mono text-[10px] tracking-wider text-zinc-500">LIVE SOURCES</p>
          {report.sources.map((source) => (
            <div key={source.source} className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-200 pt-4 text-sm">
              <span>{source.source}</span>
              <span className="text-right font-mono">{source.freshness}</span>
              <span className="text-zinc-500">Last success</span>
              <span className="text-right font-mono text-xs">{source.lastSuccessAt ?? "NO DATA"}</span>
            </div>
          ))}
        </div>

        <div className="p-8">
          <p className="font-mono text-[10px] tracking-wider text-zinc-500">VALIDATION CRITERIA</p>
          {Object.entries(report.validation.criteria).map(([key, value]) => (
            <div key={key} className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-4 text-sm">
              <span>{key}</span>
              <span className="font-mono">{value === null ? "PENDING" : value ? "PASS" : "FAIL"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-x border-b border-zinc-200 p-8">
        <p className="font-mono text-[10px] tracking-wider text-zinc-500">LIVE COUNTS</p>
        <pre className="mt-5 overflow-auto bg-zinc-50 p-5 text-xs">{JSON.stringify({ data: report.data, workers: report.workers, webhooks: report.webhooks }, null, 2)}</pre>
        {report.validation.blockers.length ? (
          <div className="mt-6 border border-zinc-950 p-5">
            <p className="font-mono text-xs">CURRENT BLOCKERS</p>
            <ul className="mt-3 space-y-2 text-sm">{report.validation.blockers.map((blocker) => <li key={blocker}>— {blocker}</li>)}</ul>
          </div>
        ) : (
          <p className="mt-6 text-sm">No operational blockers currently detected. Time-based validation remains collecting until the required observation window elapses.</p>
        )}
      </section>
    </main>
  );
}
