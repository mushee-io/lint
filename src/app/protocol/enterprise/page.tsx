import Link from "next/link";
import { getEnterpriseReadiness, getTenantUsage } from "@/lib/enterprise";
import { getOpsStatus } from "@/lib/ops";

export const dynamic = "force-dynamic";

export default async function EnterprisePage() {
  const organizationId = process.env.MARKET_LINT_PILOT_ORG_ID;
  const [ops, usage, readiness] = await Promise.all([
    getOpsStatus().catch(() => null),
    organizationId ? getTenantUsage(organizationId).catch(() => null) : Promise.resolve(null),
    organizationId ? getEnterpriseReadiness(organizationId).catch(() => null) : Promise.resolve(null),
  ]);

  return <main className="min-h-screen bg-white text-zinc-950">
    <header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12">
      <div className="flex items-center justify-between gap-4"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><span className="font-mono text-[10px] tracking-[.18em] text-zinc-500">MILESTONE 8 / ENTERPRISE</span></div>
      <h1 className="mt-14 text-5xl tracking-[-.06em] md:text-7xl">Production controls for prediction-market operators.</h1>
      <p className="mt-5 max-w-3xl text-lg text-zinc-600">Tenant isolation, API quotas, live-key lifecycle, audit export, webhook observability and production-readiness evidence in one control plane.</p>
    </header>

    <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-5">
      {[
        ["PLATFORM", ops?.status ?? "UNAVAILABLE"],
        ["TENANT", usage?.policy.status ?? "NOT SCOPED"],
        ["PLAN", usage?.policy.plan ?? "—"],
        ["MONTH USAGE", usage ? `${Math.round(usage.usage.month.utilization * 100)}%` : "—"],
        ["READINESS", readiness?.status ?? "—"],
      ].map(([label, value]) => <div key={String(label)} className="border-b border-zinc-200 p-6 md:border-b-0 md:border-r"><p className="font-mono text-[10px] tracking-wider text-zinc-500">{label}</p><p className="mt-4 text-3xl tracking-[-.05em]">{value}</p></div>)}
    </section>

    <section className="mx-auto grid max-w-7xl border-x border-b border-zinc-200 md:grid-cols-2">
      <div className="border-b border-zinc-200 p-8 md:border-b-0 md:border-r">
        <p className="font-mono text-[10px] tracking-wider text-zinc-500">TENANT CAPACITY</p>
        {usage ? <div className="mt-6 space-y-4 text-sm">
          <div className="flex justify-between border-b border-zinc-200 pb-3"><span>Monthly API requests</span><span>{usage.usage.month.used.toLocaleString()} / {usage.usage.month.limit.toLocaleString()}</span></div>
          <div className="flex justify-between border-b border-zinc-200 pb-3"><span>Per-minute limit</span><span>{usage.policy.perMinuteRequestLimit.toLocaleString()}</span></div>
          <div className="flex justify-between border-b border-zinc-200 pb-3"><span>Active API keys</span><span>{usage.integration.activeKeys}</span></div>
          <div className="flex justify-between border-b border-zinc-200 pb-3"><span>Live API keys</span><span>{usage.integration.liveKeys}</span></div>
          <div className="flex justify-between"><span>Active webhooks</span><span>{usage.integration.activeWebhooks}</span></div>
        </div> : <p className="mt-6 text-sm text-zinc-600">Set MARKET_LINT_PILOT_ORG_ID to show tenant-scoped production metrics here.</p>}
      </div>
      <div className="p-8">
        <p className="font-mono text-[10px] tracking-wider text-zinc-500">PRODUCTION READINESS</p>
        {readiness ? <div className="mt-6 space-y-3">{readiness.checks.map((check) => <div key={check.key} className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-3 text-sm"><div><p>{check.key}</p><p className="mt-1 text-xs text-zinc-500">{check.detail}{check.required ? " · required" : " · recommended"}</p></div><span className="font-mono text-xs">{check.pass ? "PASS" : "FAIL"}</span></div>)}</div> : <p className="mt-6 text-sm text-zinc-600">Tenant readiness appears after a pilot organization is scoped.</p>}
      </div>
    </section>

    <section className="mx-auto max-w-7xl border-x border-b border-zinc-200 p-8">
      <p className="font-mono text-[10px] tracking-wider text-zinc-500">ENTERPRISE SURFACES</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {["/api/v1/enterprise/usage", "/api/v1/enterprise/readiness", "/api/v1/enterprise/audit-export", "/api/v1/enterprise/policy", "/api/v1/api-keys/rotate", "/api/v1/webhooks/stats"].map((path) => <code key={path} className="border border-zinc-200 p-4 text-xs">{path}</code>)}
      </div>
      <div className="mt-8 flex gap-3"><Link href="/developers" className="bg-zinc-950 px-5 py-3 text-sm text-white">Developer portal</Link><Link href="/protocol/pilot" className="border border-zinc-950 px-5 py-3 text-sm">Pilot control center</Link></div>
    </section>
  </main>;
}
