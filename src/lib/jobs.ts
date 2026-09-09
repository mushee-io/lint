import os from "node:os";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ingestManifold, ingestPolymarket } from "@/lib/ingestion";
import { refreshFreshness } from "@/lib/freshness";
import { refreshConsensus } from "@/lib/intelligence";
import { refreshWatchEngine } from "@/lib/watch-engine";
import { deliverPendingWebhooks } from "@/lib/webhooks";

const json = (value: unknown) => value as Prisma.InputJsonValue;
export const JOB_TYPES = ["INGEST_POLYMARKET", "INGEST_MANIFOLD", "REFRESH_FRESHNESS", "EVALUATE_WATCHES", "REFRESH_CONSENSUS", "DELIVER_WEBHOOKS"] as const;
export type JobType = (typeof JOB_TYPES)[number];
export type JobHandler = (payload: Record<string, unknown>) => Promise<unknown>;
export type JobHandlers = Partial<Record<JobType, JobHandler>>;

const DEFAULT_INGEST_LIMIT = 10;
const STALLED_JOB_MS = 5 * 60_000;

export async function enqueueJob(type: JobType, payload: Record<string, unknown>, idempotencyKey: string, runAfter = new Date()) {
  return prisma.workerJob.upsert({
    where: { idempotencyKey },
    update: {},
    create: { type, payload: json(payload), idempotencyKey, runAfter },
  });
}

export async function recoverStalledJobs(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALLED_JOB_MS);
  const stalled = await prisma.workerJob.findMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    select: { id: true, attempts: true, maxAttempts: true },
  });

  let recovered = 0;
  let deadLettered = 0;
  for (const job of stalled) {
    const attempts = job.attempts + 1;
    const dead = attempts >= job.maxAttempts;
    await prisma.workerJob.update({
      where: { id: job.id },
      data: {
        status: dead ? "DEAD_LETTER" : "RETRY",
        attempts,
        runAfter: dead ? now : new Date(now.getTime() + 5_000),
        lockedAt: null,
        lockedBy: null,
        lastError: "Recovered after stale RUNNING lock",
      },
    });
    if (dead) deadLettered += 1;
    else recovered += 1;
  }
  return { checked: stalled.length, recovered, deadLettered };
}

export async function scheduleRecurringJobs(now = new Date(), ingestLimit = DEFAULT_INGEST_LIMIT) {
  const minute = Math.floor(now.getTime() / 60_000);
  const safeLimit = Math.min(Math.max(Math.floor(ingestLimit), 1), 100);
  await Promise.all([
    enqueueJob("INGEST_POLYMARKET", { limit: safeLimit }, `INGEST_POLYMARKET:${minute}`),
    enqueueJob("INGEST_MANIFOLD", { limit: safeLimit }, `INGEST_MANIFOLD:${minute}`),
    enqueueJob("REFRESH_FRESHNESS", {}, `REFRESH_FRESHNESS:${minute}`),
    enqueueJob("EVALUATE_WATCHES", {}, `EVALUATE_WATCHES:${minute}`),
    enqueueJob("DELIVER_WEBHOOKS", {}, `DELIVER_WEBHOOKS:${minute}`),
    minute % 5 === 0 ? enqueueJob("REFRESH_CONSENSUS", {}, `REFRESH_CONSENSUS:${minute}`) : Promise.resolve(null),
  ]);
}

async function claimJob(workerId: string, jobId?: string) {
  const candidate = await prisma.workerJob.findFirst({
    where: { ...(jobId ? { id: jobId } : {}), status: { in: ["PENDING", "RETRY"] }, runAfter: { lte: new Date() } },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;
  const claimed = await prisma.workerJob.updateMany({
    where: { id: candidate.id, status: { in: ["PENDING", "RETRY"] } },
    data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId },
  });
  return claimed.count === 1 ? { ...candidate, status: "RUNNING" as const } : null;
}

async function runJob(job: { id: string; type: string; payload: unknown; attempts: number; maxAttempts: number }, handlers: JobHandlers = {}) {
  const payload = (job.payload && typeof job.payload === "object" ? job.payload : {}) as Record<string, unknown>;
  const type = job.type as JobType;
  const override = handlers[type];
  if (override) return override(payload);
  switch (type) {
    case "INGEST_POLYMARKET": return ingestPolymarket(typeof payload.limit === "number" ? payload.limit : DEFAULT_INGEST_LIMIT);
    case "INGEST_MANIFOLD": return ingestManifold(typeof payload.limit === "number" ? payload.limit : DEFAULT_INGEST_LIMIT);
    case "REFRESH_FRESHNESS": return refreshFreshness();
    case "EVALUATE_WATCHES": return refreshWatchEngine();
    case "REFRESH_CONSENSUS": return refreshConsensus();
    case "DELIVER_WEBHOOKS": return deliverPendingWebhooks();
    default: throw new Error(`Unknown worker job type: ${job.type}`);
  }
}

export async function runNextJob(workerId = `${os.hostname()}:${process.pid}`, handlers: JobHandlers = {}, jobId?: string) {
  const job = await claimJob(workerId, jobId);
  if (!job) return null;
  try {
    const result = await runJob(job, handlers);
    await prisma.workerJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", attempts: { increment: 1 }, lockedAt: null, lockedBy: null, lastError: null } });
    return { id: job.id, type: job.type, status: "SUCCEEDED", result };
  } catch (error) {
    const attempts = job.attempts + 1;
    const dead = attempts >= job.maxAttempts;
    const backoffMs = Math.min(60 * 60_000, 2 ** Math.min(attempts, 10) * 5_000);
    await prisma.workerJob.update({
      where: { id: job.id },
      data: { status: dead ? "DEAD_LETTER" : "RETRY", attempts, runAfter: new Date(Date.now() + backoffMs), lockedAt: null, lockedBy: null, lastError: (error instanceof Error ? error.message : "Unknown worker error").slice(0, 1000) },
    });
    return { id: job.id, type: job.type, status: dead ? "DEAD_LETTER" : "RETRY", error: error instanceof Error ? error.message : "Unknown worker error" };
  }
}

export async function runWorkerBatch(maxJobs = 10, handlers: JobHandlers = {}, workerId = `${os.hostname()}:${process.pid}`) {
  const recovery = await recoverStalledJobs();
  await scheduleRecurringJobs();
  const results = [];
  for (let index = 0; index < maxJobs; index += 1) {
    const result = await runNextJob(workerId, handlers);
    if (!result) break;
    results.push(result);
  }
  return Object.assign(results, { recovery });
}
