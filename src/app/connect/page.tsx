"use client";

import { ArrowUpRight, Braces, CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { MarketLintFooter, MarketLintNav, MotionField, SectionTag } from "@/components/market-lint-brand";

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

  return (
    <main className="ml-page">
      <MarketLintNav />

      <section className="ml-shell ml-grid-bg grid border-b border-[var(--ml-line)] bg-[var(--ml-ice)] lg:grid-cols-[1.05fr_.95fr]">
        <div className="flex min-h-[520px] flex-col justify-between border-b border-[var(--ml-line)] p-6 sm:p-10 lg:border-b-0 lg:border-r lg:p-14 xl:p-16">
          <div>
            <SectionTag>Partner sandbox / no credentials required</SectionTag>
            <h1 className="ml-display mt-10 max-w-4xl text-[clamp(4rem,7vw,7.6rem)]">Connect your platform.</h1>
            <p className="ml-copy mt-7 max-w-2xl text-lg md:text-xl">Start with one read-only market payload. See how Market Lint normalizes it and what Guard would flag before you integrate a private feed.</p>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href="#sandbox" className="ml-button-primary">Test a market <ArrowUpRight className="size-4" /></a>
            <a href="/developers" className="ml-button-secondary">Developer API <ArrowUpRight className="size-4" /></a>
          </div>
        </div>
        <MotionField compact />
      </section>

      <section className="ml-shell grid border-b border-[var(--ml-line)] bg-white md:grid-cols-3">
        {[
          ["01", "VALIDATE", "Paste one market payload publicly. No account, persistence, wallet or trading access."],
          ["02", "PILOT", "Move to a tenant-scoped live key and send read-only market batches when you are ready."],
          ["03", "MEASURE", "Run Guard + Watch and turn the pilot into a measurable operator report."],
        ].map(([step, title, copy]) => (
          <div key={step} className="min-h-52 border-b border-[var(--ml-line)] p-7 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
            <span className="ml-mono text-[10px] text-slate-400">{step}</span>
            <h2 className="mt-7 text-3xl tracking-[-.05em]">{title}</h2>
            <p className="ml-copy mt-4 text-sm">{copy}</p>
          </div>
        ))}
      </section>

      <section id="sandbox" className="ml-shell ml-grid-bg border-b border-[var(--ml-line)] bg-[var(--ml-pale)] p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-5 border border-[var(--ml-line)] bg-white p-6 sm:p-8">
          <div>
            <span className="ml-eyebrow">READ-ONLY PARTNER SANDBOX</span>
            <h2 className="mt-3 text-4xl tracking-[-.055em] sm:text-5xl">Test Market Lint before integration.</h2>
          </div>
          <div className="ml-mono text-[10px] tracking-[.1em] text-[var(--ml-muted)]">NOTHING ON THIS PAGE IS PERSISTED</div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="ml-cut-card border border-[var(--ml-line)] bg-white p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="ml-eyebrow">01 / INPUT</span>
                <h3 className="mt-3 text-3xl tracking-[-.05em]">Market payload</h3>
              </div>
              <span className="grid size-12 place-items-center border border-[var(--ml-line)] bg-[var(--ml-pale)]"><Braces className="size-5 text-[var(--ml-cobalt)]" /></span>
            </div>

            <textarea value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} className="mt-7 min-h-[500px] w-full resize-y border border-[var(--ml-line)] bg-[var(--ml-ice)] p-5 font-mono text-xs leading-6 text-[var(--ml-ink)] outline-none transition focus:border-[var(--ml-cobalt)]" />

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <p className="ml-copy text-xs">Metadata only: IDs, wording, outcomes, timing, pricing, liquidity and resolution rules/source.</p>
              <button onClick={() => void validate()} disabled={loading} className="ml-button-primary disabled:opacity-50">{loading ? "Validating…" : "Validate payload"} <ArrowUpRight className="size-4" /></button>
            </div>
            {error ? <div className="mt-5 border border-[var(--ml-line)] bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
          </div>

          <div className="ml-cut-card border border-[var(--ml-line)] bg-white p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="ml-eyebrow">02 / OUTPUT</span>
                <h3 className="mt-3 text-3xl tracking-[-.05em]">Market Lint preview</h3>
              </div>
              <span className="grid size-12 place-items-center border border-[var(--ml-line)] bg-[var(--ml-pale)]"><ShieldCheck className="size-5 text-[var(--ml-cobalt)]" /></span>
            </div>

            {result ? (
              <pre className="mt-7 max-h-[610px] overflow-auto whitespace-pre-wrap border border-[var(--ml-line)] bg-[#102044] p-5 font-mono text-xs leading-6 text-[#dff3ff]">{JSON.stringify(result, null, 2)}</pre>
            ) : (
              <div className="mt-7 grid gap-4">
                {[
                  ["NORMALIZE", "Market Lint maps your fields into one consistent market model."],
                  ["GUARD", "The same deterministic Guard engine used by the product evaluates construction quality."],
                  ["NO CUSTODY", "No wallets, private keys, order permissions or trading credentials are required."],
                ].map(([title, copy]) => (
                  <div key={title} className="border border-[var(--ml-line)] bg-[var(--ml-ice)] p-5">
                    <div className="flex items-center gap-2 text-[var(--ml-cobalt)]"><CheckCircle2 className="size-4" /><span className="ml-eyebrow">{title}</span></div>
                    <p className="ml-copy mt-3 text-sm">{copy}</p>
                  </div>
                ))}
                <div className="mt-2 border border-[var(--ml-line)] bg-[var(--ml-pale)] p-5">
                  <span className="ml-eyebrow">PILOT ENDPOINT</span>
                  <code className="mt-3 block font-mono text-sm text-[var(--ml-cobalt)]">POST /api/v1/partner/markets</code>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="ml-shell ml-blue-panel relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 ml-grid-bg" />
        <div className="relative grid min-h-[520px] lg:grid-cols-[.85fr_1.15fr]">
          <div className="border-b border-white/25 p-8 lg:border-b-0 lg:border-r lg:p-12">
            <SectionTag>Integration boundary</SectionTag>
            <h2 className="mt-8 max-w-xl text-5xl font-medium leading-[.95] tracking-[-.065em] text-white">Your market feed in. Intelligence out.</h2>
          </div>
          <div className="grid gap-px bg-white/20 sm:grid-cols-2">
            <div className="bg-white/10 p-8 text-white"><Braces className="size-5" /><p className="mt-8 text-2xl tracking-[-.04em]">Read-only market metadata.</p></div>
            <div className="bg-white/10 p-8 text-white"><ShieldCheck className="size-5" /><p className="mt-8 text-2xl tracking-[-.04em]">Guard, Watch and operator intelligence.</p></div>
          </div>
        </div>
      </section>

      <MarketLintFooter />
    </main>
  );
}
