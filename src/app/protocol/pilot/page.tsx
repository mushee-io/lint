import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPilotMetrics } from "@/lib/pilots";

export const dynamic = "force-dynamic";

async function loadPilotData(organizationId: string) {
  try {
    const pilots = await prisma.pilot.findMany({
      where: { organizationId },
      include: { protocol: true },
      orderBy: { createdAt: "desc" },
    });
    const metrics = await Promise.all(
      pilots.map((pilot) => getPilotMetrics(pilot.id, organizationId)),
    );
    return { pilots, metrics };
  } catch {
    return null;
  }
}

export default async function PilotPage() {
  const organizationId = process.env.MARKET_LINT_PILOT_ORG_ID;

  if (!organizationId) {
    return (
      <main className="min-h-screen bg-white">
        <section className="mx-auto max-w-5xl border-x border-zinc-200 p-10">
          <Link href="/protocol" className="text-sm underline">← PROTOCOL</Link>
          <p className="mt-12 font-mono text-[11px] tracking-widest text-zinc-500">PILOT CONTROL CENTER</p>
          <h1 className="mt-3 text-5xl tracking-[-.06em]">Workspace not configured.</h1>
          <p className="mt-5 max-w-2xl text-zinc-600">
            Set MARKET_LINT_PILOT_ORG_ID in the authenticated pilot deployment. Market Lint will not expose another tenant&apos;s pilot data through a public dashboard.
          </p>
        </section>
      </main>
    );
  }

  const data = await loadPilotData(organizationId);
  if (!data) {
    return <main className="min-h-screen bg-white p-10">Pilot database unavailable. No demo metrics substituted.</main>;
  }

  const { pilots, metrics } = data;
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12">
        <Link href="/protocol" className="text-sm underline">← PROTOCOL</Link>
        <p className="mt-12 font-mono text-[11px] tracking-widest text-zinc-500">PILOT CONTROL CENTER</p>
        <h1 className="mt-3 text-5xl tracking-[-.06em]">Measured adoption.</h1>
      </section>
      <section className="mx-auto max-w-7xl border border-zinc-200">
        {pilots.length ? pilots.map((pilot, index) => (
          <article key={pilot.id} className="border-b border-zinc-200 p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="text-2xl">{pilot.name ?? pilot.protocol.name}</h2>
              <span className="font-mono text-xs">{pilot.status}</span>
            </div>
            <pre className="mt-6 overflow-auto bg-zinc-50 p-4 text-xs">{JSON.stringify(metrics[index] ?? "NO DATA", null, 2)}</pre>
          </article>
        )) : <p className="p-8">NO DATA — no pilots exist for this workspace.</p>}
      </section>
    </main>
  );
}
