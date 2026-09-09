import { prisma } from "@/lib/db";

export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

function statusFromAction(action?: string): IncidentStatus {
  if (action === "INCIDENT_RESOLVED") return "RESOLVED";
  if (action === "INCIDENT_ACKNOWLEDGED") return "ACKNOWLEDGED";
  return "OPEN";
}

export async function listIncidents(organizationId: string, options: { limit?: number; status?: string; severity?: string } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const signals = await prisma.riskSignal.findMany({
    where: {
      organizationId,
      ...(options.severity && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(options.severity)
        ? { severity: options.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }
        : {}),
    },
    include: { market: true, watch: true },
    orderBy: { detectedAt: "desc" },
    take: limit,
  });

  const ids = signals.map((signal) => signal.id);
  const logs = ids.length ? await prisma.auditLog.findMany({
    where: {
      organizationId,
      resourceType: "RiskSignal",
      resourceId: { in: ids },
      action: { in: ["INCIDENT_ACKNOWLEDGED", "INCIDENT_RESOLVED", "INCIDENT_REOPENED"] },
    },
    orderBy: { createdAt: "desc" },
  }) : [];

  const latest = new Map<string, typeof logs[number]>();
  for (const log of logs) if (log.resourceId && !latest.has(log.resourceId)) latest.set(log.resourceId, log);

  const incidents = signals.map((signal) => {
    const state = latest.get(signal.id);
    const status = statusFromAction(state?.action);
    return {
      id: signal.id,
      status,
      type: signal.type,
      severity: signal.severity,
      confidence: signal.confidence,
      explanation: signal.explanation,
      evidence: signal.evidence,
      recommendedAction: signal.recommendedAction,
      detectedAt: signal.detectedAt.toISOString(),
      market: signal.market ? { id: signal.market.id, title: signal.market.title, protocol: signal.market.protocolName, freshness: signal.market.freshness } : null,
      watchId: signal.watchId,
      lastActionAt: state?.createdAt.toISOString() ?? null,
    };
  });

  return options.status && ["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(options.status)
    ? incidents.filter((incident) => incident.status === options.status)
    : incidents;
}
