import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPartnerPilotStatus } from "@/lib/partner-pilot";
import { getPilotMetrics } from "@/lib/pilots";

export const dynamic = "force-dynamic";

async function loadPilotData(organizationId: string) {
  try {
    const pilots = await prisma.pilot.findMany({ where: { organizationId }, include: { protocol: true }, orderBy: { createdAt: "desc" } });
    const [metrics, statuses] = await Promise.all([
      Promise.all(pilots.map((pilot) => getPilotMetrics(pilot.id, organizationId))),
      Promise.all(pilots.map((pilot) => getPartnerPilotStatus(pilot.id, organizationId))),
    ]);
    return { pilots, metrics, statuses };
  } catch {
    return null;
  }
}

function percent(value: number | null) {
  return value == null ? "NO DATA" : `${(value * 100).toFixed(1)}%`;
}

function milliseconds(value: number | null) {
  return value == null ? "NO DATA" : `${Math.round(value)}ms`;
}

export default async function PilotPage() {
  const organizationId = process.env.MARKET_LINT_PILOT_ORG_ID;
  if (!organizationId) {
    return <main className="min-h-screen bg-white"><section className="mx-auto max-w-5xl border-x border-zinc-200 p-10"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><p className="mt-12 font-mono text-[11px] tracking-widest text-zinc-500">PARTNER PILOT CONTROL CENTER</p><h1 className="mt-3 text-5xl tracking-[-.06em]">Workspace not configured.</h1><p className="mt-5 max-w-2xl text-zinc-600">Set MARKET_LINT_PILOT_ORG_ID in the authenticated pilot deployment. Market Lint will not expose another tenant&apos;s pilot data through a public dashboard.</p></section></main>;
  }

  const data = await loadPilotData(organizationId);
  if (!data) return <main className="min-h-screen bg-white p-10">Pilot database unavailable. No demo metrics substituted.</main>;

  return <main className="min-h-screen bg-white text-zinc-950">
    <header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12"><div className="flex items-center justify-between"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><span className="font-mono text-[10px] tracking-[.18em] text-zinc-500">MILESTONE 9 / PARTNER PILOT</span></div><p className="mt-12 font-mono text-[11px] tracking-widest text-zinc-500">PARTNER PILOT CONTROL CENTER</p><h1 className="mt-3 text-5xl tracking-[-.06em] md:text-7xl">Prove the integration.</h1><p className="mt-5 max-w-3xl text-lg text-zinc-600">This workspace shows only measured partner activity: live-key readiness, feed connectivity, Watch coverage, webhook setup, Guard interventions, incidents, feedback and response times.</p></header>
    <section className="mx-auto max-w-7xl border border-zinc-200 border-t-0">
      {data.pilots.length ? data.pilots.map((pilot, index) => {
        const metrics = data.metrics[index];
        const status = data.statuses[index];
        return <article key={pilot.id} className="border-b border-zinc-200 p-8 last:border-b-0">
          <div className="flex flex-wrap items-baseline justify-between gap-4"><div><p className="font-mono text-[10px] tracking-wider text-zinc-500">{pilot.protocol.name}</p><h2 className="mt-2 text-3xl tracking-[-.04em]">{pilot.name ?? `${pilot.protocol.name} pilot`}</h2></div><span className="font-mono text-xs">{pilot.status}</span></div>
          {status ? <div className="mt-8 grid gap-px bg-zinc-200 md:grid-cols-7">{status.checklist.map((item) => <div key={item.key} className="bg-white p-4"><p className="font-mono text-[9px] tracking-wider text-zinc-500">{item.key}</p><p className="mt-3 text-sm">{item.pass ? "PASS" : "PENDING"}</p><p className="mt-1 text-xs text-zinc-500">{item.detail}</p></div>)}</div> : null}
          {metrics ? <><div className="mt-8 grid gap-px bg-zinc-200 md:grid-cols-6">{[
            ["MARKETS", metrics.marketsProcessed],
            ["GUARD INTERVENTIONS", metrics.guardInterventions],
            ["WATCHED", metrics.activeWatches],
            ["HIGH INCIDENTS", metrics.highSeveritySignals],
            ["WEBHOOK SUCCESS", percent(metrics.webhookSuccessRate)],
            ["FALSE POSITIVE", percent(metrics.feedback.falsePositiveRate)],
          ].map(([label, value]) => <div key={String(label)} className="bg-zinc-50 p-5"><p className="font-mono text-[9px] tracking-wider text-zinc-500">{label}</p><p className="mt-3 text-2xl tracking-[-.04em]">{value}</p></div>)}</div>
          <div className="mt-8 grid gap-4 md:grid-cols-4"><div className="border border-zinc-200 p-5"><p className="font-mono text-[9px] text-zinc-500">AVG GUARD RESPONSE</p><p className="mt-3 text-xl">{milliseconds(metrics.responseTimesMs.guardAverage)}</p></div><div className="border border-zinc-200 p-5"><p className="font-mono text-[9px] text-zinc-500">AVG FEED INGEST</p><p className="mt-3 text-xl">{milliseconds(metrics.responseTimesMs.partnerIngestAverage)}</p></div><div className="border border-zinc-200 p-5"><p className="font-mono text-[9px] text-zinc-500">AVG ACKNOWLEDGE</p><p className="mt-3 text-xl">{milliseconds(metrics.responseTimesMs.acknowledgeAverage)}</p></div><div className="border border-zinc-200 p-5"><p className="font-mono text-[9px] text-zinc-500">FEEDBACK SAMPLE</p><p className="mt-3 text-xl">{metrics.feedback.total}</p></div></div></> : <p className="mt-8 text-sm text-zinc-500">NO DATA — no measured pilot activity yet.</p>}
          <div className="mt-8 flex flex-wrap gap-3 text-sm"><span className="border border-zinc-300 px-3 py-2">POST /api/v1/pilots/{pilot.id}/activate</span><span className="border border-zinc-300 px-3 py-2">POST /api/v1/partner/markets</span><span className="border border-zinc-300 px-3 py-2">POST /api/v1/guard</span><span className="border border-zinc-300 px-3 py-2">POST /api/v1/watch</span><span className="border border-zinc-300 px-3 py-2">POST /api/v1/feedback</span><span className="border border-zinc-300 px-3 py-2">GET /api/v1/pilots/{pilot.id}/report?generate=1</span></div>
        </article>;
      }) : <p className="p-8">NO DATA — no pilots exist for this workspace.</p>}
    </section>
  </main>;
}
