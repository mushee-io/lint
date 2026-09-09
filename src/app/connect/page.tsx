"use client";

import Link from "next/link";
import { useState } from "react";

const starter = JSON.stringify({
  externalId: "market-123",
  title: "Will Bitcoin close above $150,000 on December 31, 2026?",
  description: "Resolves YES if the BTC-USD spot price at 23:59:59 UTC on December 31, 2026 is above $150,000.",
  outcomes: ["YES", "NO"],
  closeTime: "2026-12-31T23:59:59Z",
  resolutionSource: "https://www.coinbase.com/price/bitcoin",
  probability: 0.52,
  liquidity: 25000,
  volume: 100000,
  status: "OPEN"
}, null, 2);

export default function ConnectPage() {
  const [payload, setPayload] = useState(starter);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function validate() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const parsed = JSON.parse(payload);
      const response = await fetch("/api/v1/partner/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Validation failed");
      setResult(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  return <main className="min-h-screen bg-white text-zinc-950">
    <header className="mx-auto max-w-7xl border-x border-zinc-200 px-6 py-8 md:px-10">
      <div className="flex items-center justify-between gap-4"><Link href="/" className="text-sm underline underline-offset-4">MARKET LINT</Link><Link href="/explore" className="text-sm underline underline-offset-4">Live demo</Link></div>
      <p className="mt-12 font-mono text-[11px] tracking-[.18em] text-zinc-500">PARTNER SANDBOX / NO CREDENTIALS REQUIRED</p>
      <h1 className="mt-3 max-w-4xl text-6xl tracking-[-.07em]">Connect your prediction market.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">You do not need to give Market Lint trading access. Start by validating one read-only market payload below. Nothing on this page is persisted.</p>
    </header>

    <section className="mx-auto grid max-w-7xl border border-zinc-200 border-t-0 md:grid-cols-2">
      <div className="p-6 md:p-10">
        <p className="font-mono text-[11px] tracking-[.16em] text-zinc-500">01 / TEST YOUR SCHEMA</p>
        <textarea value={payload} onChange={(event) => setPayload(event.target.value)} className="mt-5 min-h-[440px] w-full border border-zinc-300 p-4 font-mono text-xs leading-6 outline-none focus:border-zinc-950" />
        <button onClick={() => void validate()} disabled={loading} className="mt-4 bg-zinc-950 px-5 py-3 text-sm text-white disabled:opacity-50">{loading ? "Validating…" : "Validate payload"}</button>
        {error ? <p className="mt-4 border border-zinc-300 p-4 text-sm">{error}</p> : null}
      </div>
      <div className="border-t border-zinc-200 p-6 md:border-t-0 md:border-l md:p-10">
        <p className="font-mono text-[11px] tracking-[.16em] text-zinc-500">02 / MARKET LINT PREVIEW</p>
        {result ? <pre className="mt-5 max-h-[560px] overflow-auto whitespace-pre-wrap bg-zinc-50 p-4 text-xs leading-6">{JSON.stringify(result, null, 2)}</pre> : <div className="mt-5 space-y-5 text-zinc-600"><p>Validation returns the normalized payload plus a real deterministic Guard preview.</p><p>When you move to a pilot, Market Lint creates a tenant-scoped live key and your platform can send market batches to <code className="bg-zinc-100 px-1">POST /api/v1/partner/markets</code>.</p><p>Market Lint needs market metadata only: IDs, wording, outcomes, timing, probability, liquidity/volume where available, and resolution rules/source. No wallet keys, trading permissions, or custody access are required.</p></div>}
      </div>
    </section>

    <section className="mx-auto grid max-w-7xl border-x border-b border-zinc-200 md:grid-cols-3">
      {[["1. Validate", "Test your market JSON publicly without credentials or persistence."], ["2. Pilot", "Receive a tenant-scoped API key and send a read-only market feed."], ["3. Measure", "Run Guard + Watch and produce a feedback-backed pilot report."]].map(([title, copy]) => <div key={title} className="border-b border-zinc-200 p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><strong>{title}</strong><p className="mt-3 text-sm leading-6 text-zinc-600">{copy}</p></div>)}
    </section>
  </main>;
}
