import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function loadGuard(organizationId: string) {
  try {
    return await prisma.guardEvaluation.findMany({
      where: { organizationId },
      include: { market: true, protocol: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch {
    return null;
  }
}

export default async function GuardPage() {
  const organizationId = process.env.MARKET_LINT_PILOT_ORG_ID;
  if (!organizationId) return <main className="min-h-screen bg-white p-10"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><h1 className="mt-12 text-5xl tracking-[-.06em]">Guard history is not exposed.</h1><p className="mt-5 text-zinc-600">Configure MARKET_LINT_PILOT_ORG_ID for the authenticated pilot workspace.</p></main>;
  const evaluations = await loadGuard(organizationId);
  if (!evaluations) return <main className="min-h-screen bg-white p-10">Guard database unavailable. No demo rows substituted.</main>;
  return <main className="min-h-screen bg-white"><header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><p className="mt-12 font-mono text-[11px] tracking-widest text-zinc-500">DURABLE GUARD</p><h1 className="mt-3 text-5xl tracking-[-.06em]">Every decision, persisted.</h1></header><section className="mx-auto max-w-7xl border border-zinc-200">{evaluations.length ? evaluations.map((evaluation) => <article key={evaluation.id} className="grid gap-5 border-b border-zinc-200 p-6 md:grid-cols-[120px_90px_1fr_220px]"><span className="font-mono text-sm font-semibold">{evaluation.decision}</span><span className="text-2xl tracking-[-.04em]">{evaluation.marketLintScore}</span><div><p className="text-sm font-medium">{evaluation.market?.title ?? "Construction-time market check"}</p><p className="mt-2 font-mono text-[10px] text-zinc-500">DUP {evaluation.duplicateRisk} / AMBIGUITY {evaluation.ambiguityRisk} / RESOLUTION {evaluation.resolutionRisk}</p></div><div className="text-right font-mono text-[10px] text-zinc-500"><p>{evaluation.algorithmVersion}</p><p className="mt-2">{evaluation.createdAt.toISOString()}</p></div></article>) : <p className="p-8">NO DATA — no persisted Guard evaluations exist for this workspace.</p>}</section></main>;
}
