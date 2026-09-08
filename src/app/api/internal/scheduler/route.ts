import { prisma } from "@/lib/db";
import { recoverStalledJobs, runWorkerBatch } from "@/lib/jobs";
import { getOpsStatus } from "@/lib/ops";
import { authorizeSchedulerRequest } from "@/lib/scheduler-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function runSchedulerTick(request: Request) {
  const auth = await authorizeSchedulerRequest(request);
  if (!auth.ok) return Response.json({ error: { message: "Scheduler authorization required" } }, { status: 401 });

  const startedAt = new Date();
  try {
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const maxJobs = Math.min(Math.max(Number((body as { maxJobs?: number }).maxJobs) || 10, 1), 12);
    const recovery = await recoverStalledJobs();
    const jobs = await runWorkerBatch(maxJobs);
    const [ops, markets, snapshots, provenance, guardEvaluations, signals, consensusSnapshots] = await Promise.all([
      getOpsStatus(),
      prisma.market.count(),
      prisma.marketSnapshot.count(),
      prisma.dataProvenance.count(),
      prisma.guardEvaluation.count(),
      prisma.riskSignal.count(),
      prisma.consensusSnapshot.count(),
    ]);

    const finishedAt = new Date();
    const metrics = {
      markets,
      snapshots,
      provenance,
      guardEvaluations,
      signals,
      consensusSnapshots,
      jobsRun: jobs.length,
      recoveredStalledJobs: recovery.recovered,
      deadLetteredStalledJobs: recovery.deadLettered,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };

    await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        actorId: auth.actor,
        action: "scheduler.tick",
        resourceType: "scheduler",
        metadata: JSON.parse(JSON.stringify({ metrics, recovery, opsStatus: ops.status, sources: ops.sources })),
      },
    });

    return Response.json({
      data: {
        ok: true,
        actor: auth.actor,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        metrics,
        recovery,
        jobs,
        ops,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scheduler failure";
    await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        actorId: auth.actor,
        action: "scheduler.tick.failed",
        resourceType: "scheduler",
        metadata: { message, startedAt: startedAt.toISOString() },
      },
    }).catch(() => null);
    return Response.json({ error: { message: "Scheduler tick failed", detail: message } }, { status: 503 });
  }
}

export async function GET(request: Request) {
  return runSchedulerTick(request);
}

export async function POST(request: Request) {
  return runSchedulerTick(request);
}
