"use client";

import { useState } from "react";

type Decision = "CONFIRM_SAME_EVENT" | "MARK_RELATED" | "REJECT";

export function GraphReviewActions({ relationshipId }: { relationshipId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: Decision) {
    if (!apiKey.trim()) {
      setStatus("Enter an API key with graph:write permission.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/v1/event-relationships/${encodeURIComponent(relationshipId)}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ decision, note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Graph decision failed");
      setStatus(`${decision} recorded. Reload to refresh the graph review queue.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Graph decision failed");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-5 border-t border-zinc-200 pt-4">
    <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" placeholder="API key with graph:write" className="w-full border border-zinc-300 px-3 py-2 font-mono text-xs outline-none focus:border-zinc-950" />
    <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Optional review note" className="mt-2 w-full border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-zinc-950" />
    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => decide("CONFIRM_SAME_EVENT")} className="bg-zinc-950 px-3 py-2 text-[10px] text-white disabled:opacity-40">CONFIRM SAME EVENT</button>
      <button disabled={busy} onClick={() => decide("MARK_RELATED")} className="border border-zinc-950 px-3 py-2 text-[10px] disabled:opacity-40">MARK RELATED</button>
      <button disabled={busy} onClick={() => decide("REJECT")} className="border border-zinc-300 px-3 py-2 text-[10px] disabled:opacity-40">REJECT MATCH</button>
    </div>
    {status ? <p className="mt-3 text-xs leading-5 text-zinc-600">{status}</p> : null}
  </div>;
}
