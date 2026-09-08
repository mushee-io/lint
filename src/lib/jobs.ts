import os from "node:os";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ingestPolymarket } from "@/lib/ingestion";
import { refreshFreshness } from "@/lib/freshness";
import { refreshConsensus, refreshWatches } from "@/lib/intelligence";
import { deliverPendingWebhooks } from "@/lib/webhooks";

const json = (value: unknown) => value as Prisma.InputJsonValue;
export const JOB_TYPES = ["INGEST_POLYMARKET", "REFRESH_FRESHNESS", "EVALUATE_WATCHES", "REFRESH_CONSENSUS", "DELIVER_WEBHOOKS"] as const;
type JobType = (typeof JOB_TYPES)[number];

export async function enqueueJob(type: JobType, payload: Record<string, unknown>, idempotencyKey: string, runAfter = new Date()) {
  return prisma.workerJob.upsert({
    where: { idempotencyKey },
    update: {},
    create: { type, payload: json(payload), idempotencyKey, runAfter },
  });
}

export async function scheduleRecurringJobs(now = new Date()) {
  const minute = Math.floor(now.getTime() / 60_000);
  await Promise.all([
    enqueueJob("INGEST_POLYMARKET", { limit: 50 }, `INGEST_POLYMARKET:${minute}`),
    enqueueJob("REFRESH_FRESHNESS", {}, `REFRESH_FRESHNESS:${minute}`),
    enqueueJob("EVALUATE_WATCHES", {}, `EVALUATE_WATCHES:${minute}`),
    enqueueJob("DELIVER_WEBHOOKS", {}, `DELIVER_WEBHOOKS:${minute}`),
    minute % 5 === 0 ? enqueueJob("REFRESH_CONSENSUS", {}, `REFRESH_CONSENSUS:${minute}`) : Promise.resolve(null),
  ]);
}

async function claimJob(workerId: string) {
  const candidate = await prisma.workerJob.findFirst({
    where: { status: { in: ["PENDING", "RETRY"] }, runAfter: { lte: new Date() } },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;
  const claimed = await prisma.workerJob.updateMany({
    where: { id: candidate.id, status: { in: ["PENDING", "RETRY"] } },
    data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId },
  });
  return claimed.count === 1 ? { ...candidate, status: "RUNNING" as const } : null;
}

async function runJob(job: { id: string; type: string; payload: unknown; attempts: number; maxAttempts: number }) {
  const payload = (job.payload && typeof job.payload === "object" ? job.payload : {}) as Record<string, unknown>;
  switch (job.type as JobType) {
    case "INGEST_POLYMARKET": return ingestPolymarket(typeof payload.limit === "number" ? payload.limit : 50);
    case "REFRESH_FRESHNESS": return refreshFreshness();
    case "EVALUATE_WATCHES": return refreshWatches();
    case "REFRESH_CONSENSUS": return refreshConsensus();
    case "DELIVER_WEBHOOKS": return deliverPendingWebhooks();
    default: throw new Error(`Unknown worker job type: ${job.type}`);
  }
}

export async function runNextJob(workerId = `${os.hostname()}:${process.pid}`) {
  const job = await claimJob(workerId);
  if (!job) return null;
  try {
    const result = await runJob(job);
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

export async function runWorkerBatch(maxJobs = 20) {
  await scheduleRecurringJobs();
  const results = [];
  for (let index = 0; index < maxJobs; index += 1) {
    const result = await runNextJob();
    if (!result) break;
    results.push(result);
  }
  return results;
}
