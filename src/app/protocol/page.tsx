import Link from "next/link";
import { getOpsStatus } from "@/lib/ops";

export const dynamic = "force-dynamic";

async function loadStatus() {
  try {
    return await getOpsStatus();
  } catch {
    return null;
  }
}

export default async function Protocol() {
  const status = await loadStatus();
  const cells = status ? [
    ["MARKETS MONITORED", status.intelligence.markets],
    ["FRESHNESS RISK", status.intelligence.marketsAtFreshnessRisk],
    ["HIGH SIGNALS / 24H", status.intelligence.activeHighSeveritySignals],
    ["CANONICAL EVENTS", status.intelligence.canonicalEvents],
    ["WORKER QUEUE", status.workers.queuedOrRunning],
  ] : [["MARKETS MONITORED", "—"], ["FRESHNESS RISK", "—"], ["HIGH SIGNALS / 24H", "—"], ["CANONICAL EVENTS", "—"], ["WORKER QUEUE", "—"]];

  const links = [
    ["Operator dashboard", "/protocol/operator", true],
    ["Incident queue", "/protocol/incidents", true],
    ["Universal event graph", "/protocol/graph", true],
    ["Monitored markets", "/protocol/markets", false],
    ["Production validation", "/protocol/validation", false],
    ["Guard history", "/protocol/guard", false],
    ["Watch", "/protocol/watch", false],
    ["Signals", "/protocol/signals", false],
    ["Pilot control center", "/protocol/pilot", false],
    ["Demo simulator", "/protocol/demo", false],
  ] as const;

  return <main className="min-h-screen bg-white"><header className="mx-auto max-w-7xl border-x border-zinc-200 p-8 md:p-12"><Link href="/" className="text-sm underline">MARKET LINT</Link><p className="mt-14 font-mono text-[11px] tracking-widest text-zinc-500">PROTOCOL INTELLIGENCE / {status?.status ?? "DATABASE OFFLINE"}</p><h1 className="mt-3 text-6xl tracking-[-.07em]">Risk, observed.</h1><p className="mt-5 text-lg text-zinc-600">Live values only. Missing infrastructure is shown as unavailable, never replaced with demo metrics.</p></header><section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-5">{cells.map(([key,value])=><div key={String(key)} className="border-b border-zinc-200 p-6 last:border-0 md:border-b-0 md:border-r"><p className="font-mono text-[10px] tracking-wider text-zinc-500">{key}</p><p className="mt-5 text-4xl tracking-[-.06em]">{value}</p></div>)}</section><section className="mx-auto flex max-w-7xl flex-wrap gap-4 border-x border-zinc-200 p-8">{links.map(([label, href, primary]) => <Link key={href} href={href} className={primary ? "bg-zinc-950 px-5 py-3 text-sm text-white" : "border border-zinc-950 px-5 py-3 text-sm"}>{label}</Link>)}</section>{status?.sources?.length ? <section className="mx-auto max-w-7xl border border-zinc-200 p-8"><p className="font-mono text-[10px] tracking-wider text-zinc-500">DATA SOURCES</p>{status.sources.map(source=><div key={source.source} className="mt-4 grid grid-cols-3 border-t border-zinc-200 pt-4 text-sm"><span>{source.source}</span><span>{source.freshness}</span><span>{source.lastSuccessAt ? new Date(source.lastSuccessAt).toISOString() : "NO DATA"}</span></div>)}</section> : null}</main>;
}
