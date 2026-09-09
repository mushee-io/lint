import Link from "next/link";
import { IncidentActions } from "@/components/protocol/incident-actions";
import { listIncidents } from "@/lib/incidents";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const organizationId = process.env.MARKET_LINT_PILOT_ORG_ID?.trim();
  if (!organizationId) return <main className="min-h-screen bg-white p-10"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><h1 className="mt-12 text-5xl tracking-[-.06em]">Incident queue is not exposed.</h1><p className="mt-5 text-zinc-600">Configure MARKET_LINT_PILOT_ORG_ID for the tenant-scoped operator workspace.</p></main>;

  const query = await searchParams;
  const status = one(query.status)?.toUpperCase() ?? "";
  const severity = one(query.severity)?.toUpperCase() ?? "";
  const incidents = await listIncidents(organizationId, { limit: 150, status: status || undefined, severity: severity || undefined });
  const metrics = {
    open: incidents.filter((incident) => incident.status === "OPEN").length,
    acknowledged: incidents.filter((incident) => incident.status === "ACKNOWLEDGED").length,
    critical: incidents.filter((incident) => incident.severity === "CRITICAL").length,
    high: incidents.filter((incident) => incident.severity === "HIGH").length,
  };

  return <main className="min-h-screen bg-white text-zinc-950">
    <header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12">
      <div className="flex flex-wrap gap-4 text-xs"><Link href="/protocol" className="underline">← PROTOCOL</Link><Link href="/protocol/watch" className="underline">WATCH</Link></div>
      <p className="mt-12 font-mono text-[10px] tracking-[.18em] text-zinc-500">WATCH V2 / INCIDENT OPERATIONS</p>
      <h1 className="mt-3 text-5xl tracking-[-.065em] md:text-7xl">Investigate what changed.</h1>
      <p className="mt-5 max-w-3xl text-lg leading-7 text-zinc-600">Every incident is grounded in a persisted Watch signal. Operators can acknowledge, resolve, or reopen incidents without changing the underlying surveillance evidence.</p>
    </header>

    <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-4">
      {[["OPEN", metrics.open], ["ACKNOWLEDGED", metrics.acknowledged], ["CRITICAL", metrics.critical], ["HIGH", metrics.high]].map(([label, value]) => <div key={String(label)} className="border-b border-zinc-200 p-6 md:border-b-0 md:border-r last:md:border-r-0"><p className="font-mono text-[9px] tracking-[.16em] text-zinc-500">{label}</p><p className="mt-4 text-4xl tracking-[-.06em]">{value}</p></div>)}
    </section>

    <section className="mx-auto max-w-7xl border-x border-zinc-200 p-6">
      <form className="flex flex-wrap gap-3">
        <select name="status" defaultValue={status} className="border border-zinc-300 bg-white px-3 py-2 text-sm"><option value="">All statuses</option><option>OPEN</option><option>ACKNOWLEDGED</option><option>RESOLVED</option></select>
        <select name="severity" defaultValue={severity} className="border border-zinc-300 bg-white px-3 py-2 text-sm"><option value="">All severities</option><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select>
        <button className="bg-zinc-950 px-5 py-2 text-sm text-white">FILTER</button>
        {(status || severity) ? <Link href="/protocol/incidents" className="px-3 py-2 font-mono text-[10px] underline">CLEAR</Link> : null}
      </form>
    </section>

    <section className="mx-auto max-w-7xl border border-zinc-200">
      {incidents.length ? incidents.map((incident) => <article key={incident.id} className="border-b border-zinc-200 p-6 md:p-8">
        <div className="grid gap-4 md:grid-cols-[120px_120px_160px_1fr]">
          <div><p className="font-mono text-[9px] text-zinc-500">SEVERITY</p><p className="mt-2 font-mono text-xs font-semibold">{incident.severity}</p></div>
          <div><p className="font-mono text-[9px] text-zinc-500">STATUS</p><p className="mt-2 font-mono text-xs">{incident.status}</p></div>
          <div><p className="font-mono text-[9px] text-zinc-500">SIGNAL</p><p className="mt-2 font-mono text-xs">{incident.type}</p></div>
          <div><p className="text-sm font-medium">{incident.market?.title ?? "Event-level incident"}</p><p className="mt-2 text-sm leading-6 text-zinc-600">{incident.explanation}</p><p className="mt-3 font-mono text-[10px] text-zinc-500">CONFIDENCE {Math.round(incident.confidence * 100)}% / {incident.detectedAt}</p>{incident.market ? <Link href={`/protocol/markets/${incident.market.id}`} className="mt-3 inline-block text-xs underline">OPEN MARKET WORKSPACE →</Link> : null}</div>
        </div>
        <details className="mt-5"><summary className="cursor-pointer font-mono text-[9px] text-zinc-500">EVIDENCE + RECOMMENDED ACTION</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap bg-zinc-50 p-4 text-[10px] leading-5">{JSON.stringify({ recommendedAction: incident.recommendedAction, evidence: incident.evidence }, null, 2)}</pre></details>
        <IncidentActions incidentId={incident.id} currentStatus={incident.status} />
      </article>) : <p className="p-8 text-sm text-zinc-500">No incidents match this queue.</p>}
    </section>
  </main>;
}
