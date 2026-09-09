"use client";

import { useState } from "react";

export function IncidentActions({ incidentId, currentStatus }: { incidentId: string; currentStatus: string }) {
  const [apiKey, setApiKey] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState(currentStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "ACKNOWLEDGE" | "RESOLVE" | "REOPEN") {
    if (!apiKey.trim()) {
      setMessage("Enter an API key with incidents:write permission first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/incidents/${encodeURIComponent(incidentId)}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ action, note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Incident action failed");
      const next = action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : action === "RESOLVE" ? "RESOLVED" : "OPEN";
      setStatus(next);
      setMessage(`${next} recorded at ${payload.data.recordedAt}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Incident action failed");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-5 border-t border-zinc-200 pt-4">
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-56 flex-1 text-[10px] font-mono text-zinc-500">API KEY<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" placeholder="ml_live_…" className="mt-2 block w-full border border-zinc-300 px-3 py-2 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-950" /></label>
      <label className="min-w-56 flex-[2] text-[10px] font-mono text-zinc-500">NOTE<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Optional incident note…" className="mt-2 block w-full border border-zinc-300 px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-950" /></label>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="mr-2 font-mono text-[10px]">{status}</span>
      <button disabled={busy} onClick={() => act("ACKNOWLEDGE")} className="border border-zinc-950 px-3 py-2 text-[10px] disabled:opacity-40">ACKNOWLEDGE</button>
      <button disabled={busy} onClick={() => act("RESOLVE")} className="bg-zinc-950 px-3 py-2 text-[10px] text-white disabled:opacity-40">RESOLVE</button>
      <button disabled={busy} onClick={() => act("REOPEN")} className="border border-zinc-300 px-3 py-2 text-[10px] disabled:opacity-40">REOPEN</button>
    </div>
    {message ? <p className="mt-3 text-xs text-zinc-600">{message}</p> : null}
  </div>;
}
