import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

const json = (value: unknown) => value as Prisma.InputJsonValue;

export async function getPilotMetrics(pilotId: string, organizationId: string) {
  const pilot = await prisma.pilot.findFirst({ where: { id: pilotId, organizationId }, include: { protocol: true } });
  if (!pilot) return null;
  const since = pilot.startedAt ?? pilot.createdAt;
  const [marketsProcessed, guardEvaluations, activeWatches, signals, deliveries, delivered, fresh, aging, stale, unknown] = await Promise.all([
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, lastIngestedAt: { gte: since } } }),
    prisma.guardEvaluation.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.watchRegistration.count({ where: { organizationId, active: true } }),
    prisma.riskSignal.count({ where: { organizationId, detectedAt: { gte: since } } }),
    prisma.webhookDelivery.count({ where: { endpoint: { organizationId }, createdAt: { gte: since } } }),
    prisma.webhookDelivery.count({ where: { endpoint: { organizationId }, status: "DELIVERED", createdAt: { gte: since } } }),
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, freshness: "FRESH" } }),
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, freshness: "AGING" } }),
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, freshness: "STALE" } }),
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, freshness: "UNKNOWN" } }),
  ]);
  const webhookSuccessRate = deliveries ? delivered / deliveries : null;
  return { pilotId, protocol: pilot.protocol.name, status: pilot.status, since: since.toISOString(), marketsProcessed, guardEvaluations, activeWatches, signals, webhookDeliveries: deliveries, webhookSuccessRate, freshness: { FRESH: fresh, AGING: aging, STALE: stale, UNKNOWN: unknown } };
}

function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

export async function generatePilotReport(pilotId: string, organizationId: string) {
  const metrics = await getPilotMetrics(pilotId, organizationId);
  if (!metrics) return null;
  const feedback = await prisma.feedback.findMany({ where: { organizationId, createdAt: { gte: new Date(metrics.since) } }, orderBy: { createdAt: "desc" }, take: 100 });
  const body = {
    generatedAt: new Date().toISOString(),
    metrics,
    feedbackSummary: feedback.length ? feedback.reduce<Record<string, number>>((acc, item) => { acc[item.label] = (acc[item.label] ?? 0) + 1; return acc; }, {}) : "NO DATA",
    note: "All values are derived from persisted Market Lint records. Missing measurements are reported as NO DATA rather than estimated.",
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Market Lint Pilot Report</title><style>body{font:14px system-ui;margin:40px;max-width:900px}h1{font-size:32px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:10px;text-align:left}</style></head><body><h1>Market Lint Pilot Report</h1><p>Protocol: ${escapeHtml(metrics.protocol)}</p><p>Status: ${escapeHtml(metrics.status)}</p><table><tbody>${Object.entries(metrics).filter(([key]) => !["pilotId","protocol","status","freshness"].includes(key)).map(([key,value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value ?? "NO DATA")}</td></tr>`).join("")}</tbody></table><h2>Freshness</h2><pre>${escapeHtml(JSON.stringify(metrics.freshness,null,2))}</pre><h2>Feedback</h2><pre>${escapeHtml(JSON.stringify(body.feedbackSummary,null,2))}</pre></body></html>`;
  const report = await prisma.pilotReport.create({ data: { pilotId, format: "JSON+HTML", body: json(body), html } });
  return { id: report.id, ...body, html };
}
