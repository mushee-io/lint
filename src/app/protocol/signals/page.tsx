import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function loadSignals(organizationId: string) {
  try {
    return await prisma.riskSignal.findMany({
      where: { organizationId },
      include: { market: true },
      orderBy: { detectedAt: "desc" },
      take: 100,
    });
  } catch {
    return null;
  }
}

export default async function SignalsPage() {
  const organizationId = process.env.MARKET_LINT_PILOT_ORG_ID;
  if (!organizationId) return <main className="min-h-screen bg-white p-10"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><h1 className="mt-12 text-5xl tracking-[-.06em]">Signals are not exposed.</h1><p className="mt-5 text-zinc-600">Configure MARKET_LINT_PILOT_ORG_ID for the authenticated pilot workspace.</p></main>;
  const signals = await loadSignals(organizationId);
  if (!signals) return <main className="min-h-screen bg-white p-10">Signal database unavailable. No demo rows substituted.</main>;
  return <main className="min-h-screen bg-white"><header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12"><Link href="/protocol" className="text-sm underline">← PROTOCOL</Link><p className="mt-12 font-mono text-[11px] tracking-widest text-zinc-500">PERSISTED SIGNAL STREAM</p><h1 className="mt-3 text-5xl tracking-[-.06em]">Risk, with evidence.</h1></header><section className="mx-auto max-w-7xl border border-zinc-200">{signals.length ? signals.map((signal) => <article key={signal.id} className="grid gap-4 border-b border-zinc-200 p-6 md:grid-cols-[130px_100px_1fr_180px]"><span className="font-mono text-xs">{signal.type}</span><span className="font-mono text-xs">{signal.severity}</span><div><p className="text-sm">{signal.explanation}</p><p className="mt-2 font-mono text-[10px] text-zinc-500">{signal.market?.title ?? signal.marketId ?? "EVENT SIGNAL"}</p></div><div className="text-right"><p className="font-mono text-[10px] text-zinc-500">CONFIDENCE</p><p className="text-lg">{Math.round(signal.confidence * 100)}%</p><p className="mt-1 font-mono text-[10px] text-zinc-500">{signal.detectedAt.toISOString()}</p></div></article>) : <p className="p-8">NO DATA — no persisted signals exist for this workspace.</p>}</section></main>;
}
