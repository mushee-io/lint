import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

const json = (value: unknown) => value as Prisma.InputJsonValue;

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export async function getPilotMetrics(pilotId: string, organizationId: string) {
  const pilot = await prisma.pilot.findFirst({ where: { id: pilotId, organizationId }, include: { protocol: true } });
  if (!pilot) return null;
  const since = pilot.startedAt ?? pilot.createdAt;
  const [marketsProcessed, guardItems, activeWatches, signalItems, deliveries, delivered, fresh, aging, stale, unknown, feedback, incidentActions, pilotMetrics] = await Promise.all([
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, lastIngestedAt: { gte: since } } }),
    prisma.guardEvaluation.findMany({ where: { organizationId, createdAt: { gte: since } }, select: { decision: true, createdAt: true } }),
    prisma.watchRegistration.count({ where: { organizationId, protocolId: pilot.protocolId, active: true } }),
    prisma.riskSignal.findMany({ where: { organizationId, detectedAt: { gte: since } }, select: { type: true, severity: true, detectedAt: true } }),
    prisma.webhookDelivery.count({ where: { endpoint: { organizationId }, createdAt: { gte: since } } }),
    prisma.webhookDelivery.count({ where: { endpoint: { organizationId }, status: "DELIVERED", createdAt: { gte: since } } }),
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, freshness: "FRESH" } }),
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, freshness: "AGING" } }),
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, freshness: "STALE" } }),
    prisma.market.count({ where: { protocolName: { equals: pilot.protocol.name, mode: "insensitive" }, freshness: "UNKNOWN" } }),
    prisma.feedback.findMany({ where: { organizationId, createdAt: { gte: since } }, select: { label: true, targetType: true } }),
    prisma.auditLog.findMany({ where: { organizationId, resourceType: "RiskSignal", action: { in: ["INCIDENT_ACKNOWLEDGED", "INCIDENT_RESOLVED"] }, createdAt: { gte: since } }, select: { action: true, metadata: true, createdAt: true } }),
    prisma.pilotMetric.findMany({ where: { pilotId, recordedAt: { gte: since } }, orderBy: { recordedAt: "asc" } }),
  ]);

  const guardDecisions = guardItems.reduce<Record<string, number>>((acc, item) => { acc[item.decision] = (acc[item.decision] ?? 0) + 1; return acc; }, { ALLOW: 0, REVIEW: 0, BLOCK: 0 });
  const signalTypes = signalItems.reduce<Record<string, number>>((acc, item) => { acc[item.type] = (acc[item.type] ?? 0) + 1; return acc; }, {});
  const severity = signalItems.reduce<Record<string, number>>((acc, item) => { acc[item.severity] = (acc[item.severity] ?? 0) + 1; return acc; }, { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 });
  const feedbackSummary = feedback.reduce<Record<string, number>>((acc, item) => { acc[item.label] = (acc[item.label] ?? 0) + 1; return acc; }, {});
  const falsePositives = feedbackSummary.FALSE_POSITIVE ?? 0;
  const falseNegatives = feedbackSummary.FALSE_NEGATIVE ?? 0;
  const labeledFeedback = feedback.length;
  const responseMs = incidentActions.map((item) => Number(objectValue(item.metadata).responseTimeMs)).filter((value) => Number.isFinite(value) && value >= 0);
  const acknowledgeResponseMs = incidentActions.filter((item) => item.action === "INCIDENT_ACKNOWLEDGED").map((item) => Number(objectValue(item.metadata).responseTimeMs)).filter((value) => Number.isFinite(value) && value >= 0);
  const resolutionResponseMs = incidentActions.filter((item) => item.action === "INCIDENT_RESOLVED").map((item) => Number(objectValue(item.metadata).responseTimeMs)).filter((value) => Number.isFinite(value) && value >= 0);
  const guardResponseMs = pilotMetrics.filter((item) => item.key === "guard.response_ms").map((item) => item.value);
  const ingestResponseMs = pilotMetrics.filter((item) => item.key === "partner.ingest_response_ms").map((item) => item.value);
  const ingestedMarkets = pilotMetrics.filter((item) => item.key === "partner.markets_ingested").reduce((sum, item) => sum + item.value, 0);
  const webhookSuccessRate = deliveries ? delivered / deliveries : null;

  return {
    pilotId,
    protocol: pilot.protocol.name,
    status: pilot.status,
    since: since.toISOString(),
    marketsProcessed,
    partnerMarketsIngested: ingestedMarkets,
    guardEvaluations: guardItems.length,
    guardDecisions,
    guardInterventions: (guardDecisions.REVIEW ?? 0) + (guardDecisions.BLOCK ?? 0),
    activeWatches,
    signals: signalItems.length,
    signalTypes,
    signalSeverity: severity,
    highSeveritySignals: (severity.HIGH ?? 0) + (severity.CRITICAL ?? 0),
    webhookDeliveries: deliveries,
    webhookSuccessRate,
    feedback: {
      total: labeledFeedback,
      labels: feedbackSummary,
      falsePositives,
      falseNegatives,
      falsePositiveRate: labeledFeedback ? falsePositives / labeledFeedback : null,
      note: "False-positive rate is computed only over partner-submitted feedback, not over unlabeled alerts.",
    },
    responseTimesMs: {
      guardAverage: average(guardResponseMs),
      partnerIngestAverage: average(ingestResponseMs),
      incidentActionAverage: average(responseMs),
      acknowledgeAverage: average(acknowledgeResponseMs),
      resolveAverage: average(resolutionResponseMs),
    },
    freshness: { FRESH: fresh, AGING: aging, STALE: stale, UNKNOWN: unknown },
  };
}

function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

export async function generatePilotReport(pilotId: string, organizationId: string) {
  const metrics = await getPilotMetrics(pilotId, organizationId);
  if (!metrics) return null;
  const body = {
    generatedAt: new Date().toISOString(),
    metrics,
    impactSummary: {
      marketsObserved: metrics.marketsProcessed,
      guardInterventions: metrics.guardInterventions,
      watchedMarkets: metrics.activeWatches,
      highSeverityIncidents: metrics.highSeveritySignals,
      webhookSuccessRate: metrics.webhookSuccessRate,
      partnerLabeledFalsePositiveRate: metrics.feedback.falsePositiveRate,
      averageGuardResponseMs: metrics.responseTimesMs.guardAverage,
      averageIncidentAcknowledgeMs: metrics.responseTimesMs.acknowledgeAverage,
    },
    note: "All values are derived from persisted Market Lint records. Missing measurements are reported as null/NO DATA rather than estimated. Guard interventions and risk signals are operational findings, not proof that harm or manipulation occurred.",
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Market Lint Partner Pilot Report</title><style>body{font:14px system-ui;margin:40px;max-width:1000px}h1{font-size:32px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:10px;text-align:left}pre{white-space:pre-wrap}</style></head><body><h1>Market Lint Partner Pilot Report</h1><p>Protocol: ${escapeHtml(metrics.protocol)}</p><p>Status: ${escapeHtml(metrics.status)}</p><h2>Impact summary</h2><pre>${escapeHtml(JSON.stringify(body.impactSummary,null,2))}</pre><h2>Full metrics</h2><pre>${escapeHtml(JSON.stringify(metrics,null,2))}</pre><p>${escapeHtml(body.note)}</p></body></html>`;
  const report = await prisma.pilotReport.create({ data: { pilotId, format: "JSON+HTML", body: json(body), html } });
  return { id: report.id, ...body, html };
}
