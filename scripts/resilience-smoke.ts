import assert from "node:assert/strict";
import { Client } from "pg";
import { databaseHealth, prisma } from "@/lib/db";
import { refreshFreshness } from "@/lib/freshness";
import { ingestSource } from "@/lib/ingestion";
import { enqueueJob, JobHandlers, runNextJob } from "@/lib/jobs";
import { createWebhookEndpoint, deliverPendingWebhooks, replayWebhookDelivery } from "@/lib/webhooks";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Resilience smoke must not run against production");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const upstreamSource = `resilience-upstream-${suffix}`;
  const staleSource = `resilience-stale-${suffix}`;
  let organizationId: string | null = null;
  let workerJobId: string | null = null;

  try {
    await assert.rejects(
      ingestSource({
        source: upstreamSource,
        protocolName: "Resilience",
        normalizationVersion: "resilience-v1",
        fetchRecords: async () => { throw new Error("simulated upstream outage"); },
      }, 1),
      /simulated upstream outage/,
    );
    const failedSource = await prisma.dataSourceState.findUniqueOrThrow({ where: { source: upstreamSource } });
    assert.equal(failedSource.consecutiveFailures, 1);
    assert.match(failedSource.lastError ?? "", /simulated upstream outage/);

    await prisma.dataSourceState.create({
      data: { source: staleSource, freshness: "FRESH", lastAttemptAt: new Date(Date.now() - 20 * 60_000), lastSuccessAt: new Date(Date.now() - 20 * 60_000) },
    });
    await refreshFreshness(new Date());
    const stale = await prisma.dataSourceState.findUniqueOrThrow({ where: { source: staleSource } });
    assert.equal(stale.freshness, "STALE");

    const workerJob = await enqueueJob("INGEST_POLYMARKET", { limit: 1 }, `resilience-worker:${suffix}`, new Date(0));
    workerJobId = workerJob.id;
    await prisma.workerJob.update({ where: { id: workerJob.id }, data: { maxAttempts: 2 } });
    const handlers: JobHandlers = { INGEST_POLYMARKET: async () => { throw new Error("simulated worker crash"); } };
    const firstWorkerAttempt = await runNextJob(`resilience:${suffix}`, handlers, workerJob.id);
    assert.equal(firstWorkerAttempt?.status, "RETRY");
    await prisma.workerJob.update({ where: { id: workerJob.id }, data: { runAfter: new Date(0) } });
    const secondWorkerAttempt = await runNextJob(`resilience:${suffix}`, handlers, workerJob.id);
    assert.equal(secondWorkerAttempt?.status, "DEAD_LETTER");

    const organization = await prisma.organization.create({ data: { name: `Resilience ${suffix}`, slug: `resilience-${suffix}` } });
    organizationId = organization.id;
    const { endpoint } = await createWebhookEndpoint({ organizationId: organization.id, url: "http://127.0.0.1:9/resilience", secret: "resilience-secret" });
    const delivery = await prisma.webhookDelivery.create({
      data: { endpointId: endpoint.id, eventType: "resilience.test", payload: { ok: true }, idempotencyKey: `resilience-webhook:${suffix}`, maxAttempts: 2 },
    });
    const unavailableFetch: typeof fetch = async () => new Response("unavailable", { status: 503 });
    await deliverPendingWebhooks(25, unavailableFetch);
    let storedDelivery = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.equal(storedDelivery.status, "RETRYING");
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(0) } });
    await deliverPendingWebhooks(25, unavailableFetch);
    storedDelivery = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.equal(storedDelivery.status, "DEAD_LETTER");

    const replayed = await replayWebhookDelivery(delivery.id, organization.id);
    assert.equal(replayed?.status, "RETRYING");
    const successFetch: typeof fetch = async () => new Response(null, { status: 204 });
    await deliverPendingWebhooks(25, successFetch);
    storedDelivery = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.equal(storedDelivery.status, "DELIVERED");

    const pidRows = await prisma.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
    const pid = pidRows.at(0)?.pid;
    assert(pid, "Could not identify a PostgreSQL backend PID");
    const killer = new Client({ connectionString: process.env.DATABASE_URL });
    await killer.connect();
    try { await killer.query("SELECT pg_terminate_backend($1)", [pid]); } finally { await killer.end(); }
    const recovered = await databaseHealth();
    assert.equal(recovered.ok, true);

    console.log(JSON.stringify({
      upstreamFailureRecorded: true,
      staleFeedDetected: true,
      workerRetryAndDeadLetter: true,
      webhookRetryDeadLetterReplay: true,
      databaseReconnect: true,
    }, null, 2));
  } finally {
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    if (workerJobId) await prisma.workerJob.delete({ where: { id: workerJobId } }).catch(() => undefined);
    await prisma.dataSourceState.deleteMany({ where: { source: { in: [upstreamSource, staleSource] } } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
