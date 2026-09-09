"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketLintFooter, MarketLintNav, MotionField, SectionTag } from "@/components/market-lint-brand";
import type { Market } from "@/lib/market-types";

type Source = { protocol: string; status: "LIVE" | "UNAVAILABLE"; marketCount: number; retrievedAt: string | null; error: string | null };
type Network = { mode: "LIVE_PUBLIC_DATA"; generatedAt: string; sources: Source[]; markets: Market[] };

async function loadNetwork() {
  const response = await fetch("/api/v1/live/network?limit=40", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.detail ?? body.error?.message ?? "Live network unavailable");
  return body.data as Network;
}

function probabilityLabel(market: Market) {
  return market.prices.length ? `${Math.round(market.prices[0] * 100)}%` : "—";
}

function liquidityLabel(market: Market) {
  return market.liquidity > 0 ? `$${market.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";
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

  return (
    <main className="ml-page">
      <MarketLintNav />

      <section className="ml-shell ml-grid-bg grid border-b border-[var(--ml-line)] bg-[var(--ml-ice)] lg:grid-cols-[1.05fr_.95fr]">
        <div className="flex min-h-[520px] flex-col justify-between border-b border-[var(--ml-line)] p-6 sm:p-10 lg:border-b-0 lg:border-r lg:p-14 xl:p-16">
          <div>
            <SectionTag>Live public network / no login</SectionTag>
            <h1 className="ml-display mt-10 max-w-4xl text-[clamp(4rem,7vw,7.6rem)]">Explore live markets.</h1>
            <p className="ml-copy mt-7 max-w-2xl text-lg md:text-xl">Real read-only market data from public prediction-market APIs, wrapped in Market Lint quality and operational context.</p>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <button onClick={() => void refresh()} disabled={loading} className="ml-button-primary disabled:opacity-50">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Refreshing" : "Refresh network"}
            </button>
            <Link href="/connect" className="ml-button-secondary">Connect your platform <ArrowUpRight className="size-4" /></Link>
          </div>
        </div>
        <MotionField compact />
      </section>

      <section className="ml-shell grid border-b border-[var(--ml-line)] bg-white md:grid-cols-3">
        {(data?.sources ?? [
          { protocol: "Polymarket", status: "UNAVAILABLE", marketCount: 0, retrievedAt: null, error: null },
          { protocol: "Manifold", status: "UNAVAILABLE", marketCount: 0, retrievedAt: null, error: null },
          { protocol: "Kalshi", status: "UNAVAILABLE", marketCount: 0, retrievedAt: null, error: null },
        ]).map((source) => (
          <div key={source.protocol} className="min-h-40 border-b border-[var(--ml-line)] p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="ml-eyebrow">{source.protocol.toUpperCase()}</span>
                <div className="mt-3 text-3xl font-medium tracking-[-.055em]">{source.marketCount}</div>
                <p className="ml-mono mt-1 text-[10px] text-[var(--ml-muted)]">PUBLIC MARKETS</p>
              </div>
              <span className={`ml-mono inline-flex items-center gap-2 border px-2.5 py-2 text-[9px] tracking-[.12em] ${source.status === "LIVE" ? "border-blue-300 bg-blue-50 text-[var(--ml-cobalt)]" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                <span className={`size-1.5 rounded-full ${source.status === "LIVE" ? "bg-[var(--ml-cobalt)]" : "bg-slate-300"}`} />
                {source.status}
              </span>
            </div>
            {source.error ? <p className="ml-copy mt-5 text-xs">{source.error}</p> : <p className="ml-copy mt-5 text-xs">Read-only public source. No wallet or trading access.</p>}
          </div>
        ))}
      </section>

      <section className="ml-shell ml-grid-bg border-b border-[var(--ml-line)] bg-[var(--ml-pale)] p-5 sm:p-8 lg:p-10">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="flex min-h-16 items-center gap-3 border border-[var(--ml-line)] bg-white px-5">
            <Search className="size-4 text-[var(--ml-cobalt)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets, protocols or categories" className="w-full bg-transparent text-base outline-none placeholder:text-slate-400" />
          </label>
          <div className="flex min-h-16 items-center border border-[var(--ml-line)] bg-white px-5">
            <span className="ml-mono text-[10px] tracking-[.12em] text-[var(--ml-muted)]">SHOWING {shown.length} / {data?.markets.length ?? 0}</span>
          </div>
        </div>
        {error && !data ? <div className="mt-4 border border-[var(--ml-line)] bg-white p-5 text-sm text-[var(--ml-muted)]">Public feeds unavailable: {error}</div> : null}
      </section>

      <section className="ml-shell bg-[var(--ml-ice)] p-4 sm:p-6 lg:p-8">
        {loading && !data ? <div className="border border-[var(--ml-line)] bg-white p-8"><p className="ml-copy">Loading live public markets…</p></div> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {shown.map((market, index) => (
            <article key={market.id} className="group ml-cut-card border border-[var(--ml-line)] bg-white p-6 transition duration-300 hover:-translate-y-1 hover:bg-[#f7fbff] sm:p-7">
              <div className="flex items-start justify-between gap-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ml-mono border border-[var(--ml-line)] bg-[var(--ml-pale)] px-2.5 py-2 text-[9px] tracking-[.12em] text-[var(--ml-cobalt)]">{market.protocol.toUpperCase()}</span>
                  <span className="ml-mono border border-[var(--ml-line)] px-2.5 py-2 text-[9px] tracking-[.12em] text-[var(--ml-muted)]">{market.status}</span>
                </div>
                <span className="ml-mono text-[10px] text-slate-400">{String(index + 1).padStart(2, "0")}</span>
              </div>

              <h2 className="mt-8 min-h-[72px] text-3xl font-medium leading-[1.02] tracking-[-.05em] sm:text-[2.15rem]">{market.title}</h2>
              <p className="ml-copy mt-4 text-sm">{market.category || "Uncategorized"}</p>

              <div className="mt-8 grid grid-cols-3 border border-[var(--ml-line)]">
                <div className="border-r border-[var(--ml-line)] bg-[var(--ml-pale)] p-4">
                  <span className="ml-eyebrow">LINT SCORE</span>
                  <strong className="mt-3 block text-3xl tracking-[-.06em] text-[var(--ml-cobalt)]">{market.score.overall}</strong>
                </div>
                <div className="border-r border-[var(--ml-line)] p-4">
                  <span className="ml-eyebrow">PROBABILITY</span>
                  <strong className="mt-3 block text-3xl tracking-[-.06em]">{probabilityLabel(market)}</strong>
                </div>
                <div className="p-4">
                  <span className="ml-eyebrow">LIQUIDITY</span>
                  <strong className="mt-3 block text-lg tracking-[-.03em]">{liquidityLabel(market)}</strong>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--ml-line)] pt-5">
                <div className="flex items-center gap-2 text-xs text-[var(--ml-muted)]"><ShieldCheck className="size-4 text-[var(--ml-cobalt)]" /> Read-only source evidence</div>
                <a href={market.marketUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[.08em] text-[var(--ml-cobalt)]">OPEN MARKET <ArrowUpRight className="size-4" /></a>
              </div>
            </article>
          ))}
        </div>

        {!loading && data && !shown.length ? <div className="border border-[var(--ml-line)] bg-white p-8"><p className="ml-copy">No live markets match that search.</p></div> : null}
      </section>

      <section className="ml-shell ml-blue-panel grid border-t border-[var(--ml-line)] lg:grid-cols-[.8fr_1.2fr]">
        <div className="border-b border-white/25 p-8 lg:border-b-0 lg:border-r lg:p-12">
          <SectionTag>Public intelligence layer</SectionTag>
          <h2 className="mt-8 max-w-xl text-5xl font-medium leading-[.95] tracking-[-.065em] text-white">One network. Multiple market venues.</h2>
        </div>
        <div className="grid gap-px bg-white/20 sm:grid-cols-2">
          <div className="bg-white/10 p-8 text-white"><Activity className="size-5" /><p className="mt-8 text-2xl tracking-[-.04em]">Live source health stays visible.</p></div>
          <div className="bg-white/10 p-8 text-white"><ShieldCheck className="size-5" /><p className="mt-8 text-2xl tracking-[-.04em]">No synthetic fallback when a source fails.</p></div>
        </div>
      </section>

      <MarketLintFooter />
    </main>
  );
}
