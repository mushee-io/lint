"use client";

import { useState } from "react";

type ReviewPayload = {
  verdict: string;
  confidence: number;
  summary: string;
  suggestedMarketRewrite: string | null;
  suggestedSettlementRules: string | null;
  operatorActions: string[];
  uncertainty: string[];
  mode: string;
  providerStatus: string;
};

export function OperatorActions({ marketId }: { marketId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitDecision(decision: "APPROVE" | "HOLD" | "REJECT") {
    if (!apiKey.trim()) {
      setStatus("Enter an API key with operator:decision permission first.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/v1/markets/${encodeURIComponent(marketId)}/decision`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({ decision, note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Decision failed");
      setStatus(`${decision} recorded at ${payload.data.createdAt}. Reload to see it in history.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }

  async function runReview(mode: "deterministic" | "ai") {
    if (mode === "ai" && !apiKey.trim()) {
      setStatus("Enter an API key with intelligence:review permission before requesting AI.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/v1/markets/${encodeURIComponent(marketId)}/review`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey.trim() ? { authorization: `Bearer ${apiKey.trim()}` } : {}),
        },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json();
      if (!response.ok && !payload?.data) throw new Error(payload?.error?.message ?? "Review failed");
      setReview(payload.data as ReviewPayload);
      if (!response.ok) setStatus(payload?.error?.message ?? "Provider-backed AI was unavailable; fallback returned.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  return <section className="border border-zinc-200 bg-white p-6">
    <div className="flex flex-col gap-2 border-b border-zinc-200 pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="font-mono text-[10px] tracking-[.18em] text-zinc-500">OPERATOR CONTROL</p>
        <h2 className="mt-2 text-2xl tracking-[-.04em]">Review and decide.</h2>
      </div>
      <p className="max-w-xl text-xs leading-5 text-zinc-500">API keys stay in this browser request only. Market Lint does not embed an operator credential in the public dashboard.</p>
    </div>

    <label className="mt-5 block text-xs font-medium text-zinc-600">API key</label>
    <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" placeholder="ml_live_…" className="mt-2 w-full border border-zinc-300 px-3 py-2 font-mono text-xs outline-none focus:border-zinc-900" />

    <label className="mt-4 block text-xs font-medium text-zinc-600">Decision note</label>
    <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} placeholder="Optional operator rationale…" className="mt-2 w-full border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900" />

    <div className="mt-4 flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => submitDecision("APPROVE")} className="bg-zinc-950 px-4 py-2 text-xs text-white disabled:opacity-40">APPROVE</button>
      <button disabled={busy} onClick={() => submitDecision("HOLD")} className="border border-zinc-950 px-4 py-2 text-xs disabled:opacity-40">HOLD</button>
      <button disabled={busy} onClick={() => submitDecision("REJECT")} className="border border-zinc-950 px-4 py-2 text-xs disabled:opacity-40">REJECT</button>
      <span className="mx-2 hidden h-8 border-l border-zinc-200 sm:block" />
      <button disabled={busy} onClick={() => runReview("deterministic")} className="border border-zinc-300 px-4 py-2 text-xs disabled:opacity-40">RUN GROUNDED REVIEW</button>
      <button disabled={busy} onClick={() => runReview("ai")} className="border border-zinc-300 px-4 py-2 text-xs disabled:opacity-40">RUN AI REVIEW</button>
    </div>

    {status ? <p className="mt-4 border-l-2 border-zinc-950 pl-3 text-xs leading-5 text-zinc-600">{status}</p> : null}

    {review ? <div className="mt-6 border-t border-zinc-200 pt-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div><p className="font-mono text-[9px] text-zinc-500">VERDICT</p><p className="mt-2 text-xl">{review.verdict}</p></div>
        <div><p className="font-mono text-[9px] text-zinc-500">CONFIDENCE</p><p className="mt-2 text-xl">{review.confidence}</p></div>
        <div><p className="font-mono text-[9px] text-zinc-500">MODE</p><p className="mt-2 text-sm">{review.mode}</p></div>
        <div><p className="font-mono text-[9px] text-zinc-500">PROVIDER</p><p className="mt-2 text-sm">{review.providerStatus}</p></div>
      </div>
      <p className="mt-5 text-sm leading-6 text-zinc-700">{review.summary}</p>
      {review.suggestedMarketRewrite ? <div className="mt-5 border border-zinc-200 p-4"><p className="font-mono text-[9px] text-zinc-500">SUGGESTED MARKET REWRITE</p><p className="mt-2 text-sm leading-6">{review.suggestedMarketRewrite}</p></div> : null}
      {review.suggestedSettlementRules ? <div className="mt-3 border border-zinc-200 p-4"><p className="font-mono text-[9px] text-zinc-500">SUGGESTED SETTLEMENT RULES</p><p className="mt-2 text-sm leading-6">{review.suggestedSettlementRules}</p></div> : null}
    </div> : null}
  </section>;
}
