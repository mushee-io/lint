import { prisma } from "@/lib/db";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const SCHEDULER_INTERVAL_MINUTES = 5;

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function maxHeartbeatGapMinutes(timestamps: Date[], now: Date) {
  if (timestamps.length === 0) return null;
  let maxGap = Math.max(0, now.getTime() - timestamps[timestamps.length - 1].getTime());
  for (let index = 1; index < timestamps.length; index += 1) {
    maxGap = Math.max(maxGap, timestamps[index].getTime() - timestamps[index - 1].getTime());
  }
  return round(maxGap / MINUTE_MS, 2);
}

function coverage(count: number, observedMinutes: number) {
  if (observedMinutes <= 0) return 0;
  const expected = Math.max(1, Math.floor(observedMinutes / SCHEDULER_INTERVAL_MINUTES));
  return round(Math.min(1, count / expected), 4);
}

export async function buildValidationReport(now = new Date()) {
  const cutoff72h = new Date(now.getTime() - 72 * HOUR_MS);
  const cutoff24h = new Date(now.getTime() - 24 * HOUR_MS);

  const [firstHeartbeat, lastHeartbeat, heartbeats72h, failedTicks72h, sources, marketCount, snapshotCount, provenanceCount, canonicalEvents, guardEvaluations, signals, consensusSnapshots, workerJobsDead, workerJobsRetrying, workerJobsSucceeded72h, webhooksDead, webhooksDelivered72h] = await Promise.all([
    prisma.auditLog.findFirst({ where: { action: "scheduler.tick" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.auditLog.findFirst({ where: { action: "scheduler.tick" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.auditLog.findMany({ where: { action: "scheduler.tick", createdAt: { gte: cutoff72h } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.auditLog.count({ where: { action: "scheduler.tick.failed", createdAt: { gte: cutoff72h } } }),
    prisma.dataSourceState.findMany({ orderBy: { source: "asc" } }),
    prisma.market.count(),
    prisma.marketSnapshot.count(),
    prisma.dataProvenance.count(),
    prisma.canonicalEvent.count(),
    prisma.guardEvaluation.count(),
    prisma.riskSignal.count(),
    prisma.consensusSnapshot.count(),
    prisma.workerJob.count({ where: { status: "DEAD_LETTER" } }),
    prisma.workerJob.count({ where: { status: "RETRY" } }),
    prisma.workerJob.count({ where: { status: "SUCCEEDED", updatedAt: { gte: cutoff72h } } }),
    prisma.webhookDelivery.count({ where: { status: "DEAD_LETTER" } }),
    prisma.webhookDelivery.count({ where: { status: "DELIVERED", deliveredAt: { gte: cutoff72h } } }),
  ]);

  const timestamps = heartbeats72h.map((entry) => entry.createdAt);
  const heartbeats24h = timestamps.filter((timestamp) => timestamp >= cutoff24h).length;
  const totalObservedHours = firstHeartbeat ? Math.max(0, (now.getTime() - firstHeartbeat.createdAt.getTime()) / HOUR_MS) : 0;
  const observed72Minutes = Math.min(totalObservedHours * 60, 72 * 60);
  const observed24Minutes = Math.min(totalObservedHours * 60, 24 * 60);
  const sourceMap = new Map(sources.map((source) => [source.source, source]));
  const requiredSources = ["polymarket-gamma", "manifold-v0"];
  const missingSources = requiredSources.filter((source) => !sourceMap.has(source));
  const failingSources = sources.filter((source) => source.consecutiveFailures > 0 || source.freshness === "STALE" || source.freshness === "UNKNOWN");
  const maxGapMinutes = maxHeartbeatGapMinutes(timestamps, now);
  const coverage24h = coverage(heartbeats24h, observed24Minutes);
  const coverage72h = coverage(heartbeats72h.length, observed72Minutes);

  const collectionStage = totalObservedHours >= 72 ? "READY_72H" : totalObservedHours >= 24 ? "READY_24H" : "COLLECTING";
  const blockers: string[] = [];
  if (missingSources.length) blockers.push(`Missing live source state: ${missingSources.join(", ")}`);
  if (failingSources.length) blockers.push(`Source freshness/failure issue: ${failingSources.map((source) => source.source).join(", ")}`);
  if (workerJobsDead > 0) blockers.push(`${workerJobsDead} worker job(s) in dead-letter state`);
  if (webhooksDead > 0) blockers.push(`${webhooksDead} webhook delivery(s) in dead-letter state`);
  if (failedTicks72h > 0) blockers.push(`${failedTicks72h} scheduler tick failure(s) observed in the last 72h`);
  if (maxGapMinutes !== null && maxGapMinutes > 30) blockers.push(`Scheduler heartbeat gap reached ${maxGapMinutes} minutes`);
  if (collectionStage !== "COLLECTING" && coverage24h < 0.8) blockers.push(`24h scheduler coverage is ${round(coverage24h * 100, 1)}%`);

  return {
    generatedAt: now.toISOString(),
    scheduler: {
      intendedIntervalMinutes: SCHEDULER_INTERVAL_MINUTES,
      firstHeartbeatAt: firstHeartbeat?.createdAt.toISOString() ?? null,
      lastHeartbeatAt: lastHeartbeat?.createdAt.toISOString() ?? null,
      observedHours: round(totalObservedHours, 2),
      heartbeats24h,
      heartbeats72h: heartbeats72h.length,
      coverage24h,
      coverage72h,
      maxGapMinutes,
      failedTicks72h,
    },
    sources: sources.map((source) => ({
      source: source.source,
      freshness: source.freshness,
      lastAttemptAt: source.lastAttemptAt?.toISOString() ?? null,
      lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
      consecutiveFailures: source.consecutiveFailures,
      lastError: source.lastError,
    })),
    data: {
      markets: marketCount,
      snapshots: snapshotCount,
      provenance: provenanceCount,
      canonicalEvents,
      guardEvaluations,
      signals,
      consensusSnapshots,
    },
    workers: {
      succeeded72h: workerJobsSucceeded72h,
      retrying: workerJobsRetrying,
      deadLetter: workerJobsDead,
    },
    webhooks: {
      delivered72h: webhooksDelivered72h,
      deadLetter: webhooksDead,
    },
    validation: {
      stage: collectionStage,
      assessment: blockers.length === 0 ? (collectionStage === "COLLECTING" ? "COLLECTING" : "GO") : "DEGRADED",
      blockers,
      criteria: {
        twoLiveSourcesObserved: missingSources.length === 0,
        sourceHealthAcceptable: failingSources.length === 0,
        noDeadWorkerJobs: workerJobsDead === 0,
        noDeadWebhooks: webhooksDead === 0,
        schedulerGapUnder30Minutes: maxGapMinutes === null ? false : maxGapMinutes <= 30,
        schedulerCoverage24hAtLeast80Percent: collectionStage === "COLLECTING" ? null : coverage24h >= 0.8,
      },
    },
  };
}
