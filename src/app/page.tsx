import Link from "next/link";
import { ArrowUpRight, Check, ScanLine } from "lucide-react";

const principles = ["Unambiguous outcomes", "Auditable resolution", "Decision-ready intelligence"];

export default function Home() {
  return <main className="min-h-screen bg-white text-zinc-950">
    <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-x border-zinc-200 px-6 py-5 md:px-10">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-[-.03em]"><ScanLine className="size-4" /> MARKET LINT</Link>
      <div className="flex flex-wrap items-center gap-5 text-sm font-medium"><Link href="/explore" className="underline underline-offset-4">Live markets</Link><Link href="/connect" className="underline underline-offset-4">Connect platform</Link><Link href="/analyze" className="underline underline-offset-4">Analyze a market</Link></div>
    </nav>
    <section className="mx-auto grid max-w-7xl border-x border-zinc-200 md:grid-cols-12">
      <div className="col-span-8 px-6 py-20 md:px-10 md:py-32">
        <p className="mb-8 font-mono text-[11px] tracking-[.18em] text-zinc-500">LIVE PREDICTION MARKET INTELLIGENCE / 01</p>
        <h1 className="max-w-4xl text-5xl font-medium leading-[.94] tracking-[-.075em] md:text-8xl">The Intelligence Layer for Prediction Markets.</h1>
        <p className="mt-10 max-w-xl text-lg leading-8 text-zinc-600">Inspect live public markets, find construction and resolution risk, and test how your own platform would connect to Market Lint.</p>
        <div className="mt-10 flex flex-wrap gap-3"><Link href="/explore" className="inline-flex items-center gap-3 bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700">Explore Live Markets <ArrowUpRight className="size-4" /></Link><Link href="/connect" className="inline-flex items-center gap-3 border border-zinc-950 px-5 py-3 text-sm font-medium">Connect Your Platform <ArrowUpRight className="size-4" /></Link></div>
        <p className="mt-5 font-mono text-[10px] tracking-wider text-zinc-500">PUBLIC READ-ONLY DATA · POLYMARKET · MANIFOLD · KALSHI · NO LOGIN</p>
      </div>
      <aside className="col-span-4 border-t border-zinc-200 p-6 md:border-t-0 md:border-l md:p-10">
        <p className="font-mono text-[11px] tracking-[.18em] text-zinc-500">WHAT WE CHECK</p>
        <div className="mt-12 space-y-8">{principles.map((item, index) => <div key={item} className="border-t border-zinc-200 pt-4"><span className="font-mono text-xs text-zinc-400">0{index + 1}</span><p className="mt-2 text-xl tracking-[-.04em]">{item}</p></div>)}</div>
      </aside>
    </section>
    <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-3">{[["1. Observe", "Read real markets from public operator APIs."], ["2. Inspect", "Run deterministic Market Lint scoring and duplicate intelligence."], ["3. Connect", "Validate your platform's market schema before any private integration."]].map(([number, text]) => <div key={number} className="border-b border-zinc-200 p-6 last:border-b-0 md:border-b-0 md:border-r md:p-10 md:last:border-r-0"><p className="font-mono text-xs text-zinc-500">{number}</p><p className="mt-7 max-w-xs text-xl leading-7 tracking-[-.04em]">{text}</p><Check className="mt-10 size-4" /></div>)}</section>
  </main>;
}
