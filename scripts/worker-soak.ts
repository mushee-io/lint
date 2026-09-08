import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { runNextJob, scheduleRecurringJobs } from "@/lib/jobs";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const durationMs = Math.max(1_000, Number(process.env.SOAK_DURATION_MS ?? 60 * 60_000));
  const intervalMs = Math.max(100, Number(process.env.SOAK_INTERVAL_MS ?? 60_000));
  const configuredCycles = Number(process.env.SOAK_CYCLES ?? 0);
  const simulateMinutes = process.env.SOAK_SIMULATE_MINUTES === "1";
  const startedAt = new Date();
  let cycle = 0;
  let succeeded = 0;
  let retries = 0;
  let deadLetters = 0;

  while (configuredCycles > 0 ? cycle < configuredCycles : Date.now() - startedAt.getTime() < durationMs) {
    const scheduledAt = simulateMinutes ? new Date(startedAt.getTime() + cycle * 60_000) : new Date();
    await scheduleRecurringJobs(scheduledAt);
    for (let index = 0; index < 30; index += 1) {
      const result = await runNextJob(`soak:${process.pid}`);
      if (!result) break;
      if (result.status === "SUCCEEDED") succeeded += 1;
      else if (result.status === "RETRY") retries += 1;
      else if (result.status === "DEAD_LETTER") deadLetters += 1;
    }
    cycle += 1;
    if (configuredCycles > 0 ? cycle < configuredCycles : Date.now() - startedAt.getTime() < durationMs) await sleep(intervalMs);
  }

  const sources = await prisma.dataSourceState.findMany({ where: { source: { in: ["polymarket-gamma", "manifold-v0"] } }, orderBy: { source: "asc" } });
  const queue = await prisma.workerJob.groupBy({ by: ["status"], _count: { _all: true } });
  assert.equal(deadLetters, 0, "A worker job reached DEAD_LETTER during the soak run");
  console.log(JSON.stringify({ startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), cycles: cycle, succeeded, retries, deadLetters, sources, queue }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
