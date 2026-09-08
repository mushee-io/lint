import { databaseHealth, prisma } from "@/lib/db";

export async function getOpsStatus() {
  const database = await databaseHealth();
  const [markets, atRisk, canonicalEvents, activeSignals, sources, jobsPending, jobsDead, deliveriesPending, deliveriesDead] = await Promise.all([
    prisma.market.count(),
    prisma.market.count({ where: { freshness: { in: ["STALE", "UNKNOWN"] } } }),
    prisma.canonicalEvent.count(),
    prisma.riskSignal.count({ where: { severity: { in: ["HIGH", "CRITICAL"] }, detectedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } }),
    prisma.dataSourceState.findMany({ orderBy: { source: "asc" } }),
    prisma.workerJob.count({ where: { status: { in: ["PENDING", "RETRY", "RUNNING"] } } }),
    prisma.workerJob.count({ where: { status: "DEAD_LETTER" } }),
    prisma.webhookDelivery.count({ where: { status: { in: ["PENDING", "RETRYING"] } } }),
    prisma.webhookDelivery.count({ where: { status: "DEAD_LETTER" } }),
  ]);
  return {
    status: jobsDead || deliveriesDead ? "DEGRADED" : "READY",
    database,
    intelligence: { markets, marketsAtFreshnessRisk: atRisk, canonicalEvents, activeHighSeveritySignals: activeSignals },
    sources: sources.map((source) => ({ source: source.source, freshness: source.freshness, lastSuccessAt: source.lastSuccessAt, lastAttemptAt: source.lastAttemptAt, consecutiveFailures: source.consecutiveFailures, lastError: source.lastError })),
    workers: { queuedOrRunning: jobsPending, deadLetter: jobsDead },
    webhooks: { queuedOrRetrying: deliveriesPending, deadLetter: deliveriesDead },
    checkedAt: new Date().toISOString(),
  };
}
