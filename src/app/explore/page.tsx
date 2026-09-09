"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Market } from "@/lib/market-types";

type Source = { protocol: string; status: "LIVE" | "UNAVAILABLE"; marketCount: number; retrievedAt: string | null; error: string | null };
type Network = { mode: "LIVE_PUBLIC_DATA"; generatedAt: string; sources: Source[]; markets: Market[] };

async function loadNetwork() {
  const response = await fetch("/api/v1/live/network?limit=40", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.detail ?? body.error?.message ?? "Live network unavailable");
  return body.data as Network;
}

export default function Explore() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Network | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await loadNetwork()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Live network unavailable"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    loadNetwork()
      .then((network) => { if (active) setData(network); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Live network unavailable"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const shown = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!data) return [];
    return data.markets.filter((market) => !normalized || `${market.title} ${market.protocol} ${market.category}`.toLowerCase().includes(normalized));
  }, [data, query]);

  return <main className="min-h-screen bg-white text-zinc-950">
    <header className="mx-auto max-w-7xl border-x border-zinc-200 px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-sm underline underline-offset-4">MARKET LINT</Link>
        <div className="flex items-center gap-4 text-sm"><Link href="/connect" className="underline underline-offset-4">Connect your platform</Link><button onClick={() => void refresh()} className="border border-zinc-950 px-3 py-2">Refresh</button></div>
      </div>
      <p className="mt-12 font-mono text-[11px] tracking-[.18em] text-zinc-500">LIVE PUBLIC NETWORK / NO LOGIN</p>
      <h1 className="mt-3 text-6xl tracking-[-.07em]">Explore live markets.</h1>
      <p className="mt-4 max-w-2xl text-zinc-600">Real read-only market data from public prediction-market APIs. No synthetic fallback is shown when a source is unavailable.</p>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets or protocols" className="mt-10 w-full border-b border-zinc-950 py-4 text-lg outline-none" />
    </header>

    <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-3">
      {(data?.sources ?? []).map((source) => <div key={source.protocol} className="border-b border-zinc-200 p-5 md:border-b-0 md:border-r md:last:border-r-0">
        <p className="font-mono text-[11px] tracking-wider text-zinc-500">{source.protocol.toUpperCase()}</p>
        <div className="mt-2 flex items-baseline justify-between gap-3"><strong>{source.status}</strong><span className="text-sm text-zinc-500">{source.marketCount} markets</span></div>
        {source.error ? <p className="mt-2 text-xs text-zinc-500">{source.error}</p> : null}
      </div>)}
    </section>

    <section className="mx-auto max-w-7xl border-x border-zinc-200 border-b border-zinc-200">
      {loading && !data ? <p className="p-8">Loading live public markets…</p> : null}
      {error && !data ? <p className="p-8">Public feeds unavailable: {error}</p> : null}
      {shown.map((market) => <article key={market.id} className="grid gap-5 border-b border-zinc-200 p-6 last:border-0 md:grid-cols-12 md:p-8">
        <div className="md:col-span-7">
          <p className="font-mono text-[11px] tracking-wider text-zinc-500">{market.protocol.toUpperCase()} / {market.status}</p>
          <h2 className="mt-2 text-2xl tracking-[-.04em]">{market.title}</h2>
          <a href={market.marketUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm underline underline-offset-4">Open source market ↗</a>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm md:col-span-5">
          <div><p className="text-zinc-500">Lint score</p><strong className="text-2xl">{market.score.overall}</strong></div>
          <div><p className="text-zinc-500">Probability</p><strong className="text-2xl">{market.prices.length ? `${Math.round(market.prices[0] * 100)}%` : "—"}</strong></div>
          <div><p className="text-zinc-500">Liquidity</p><strong>{market.liquidity > 0 ? `$${market.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</strong></div>
        </div>
      </article>)}
      {!loading && data && !shown.length ? <p className="p-8">No live markets match that search.</p> : null}
    </section>
  </main>;
}
