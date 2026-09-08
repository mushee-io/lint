import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db";
import { createApiKey, requireAccess } from "../src/lib/auth";
import { ingestPolymarket } from "../src/lib/ingestion";
import { refreshConsensus } from "../src/lib/intelligence";
import { createWebhookEndpoint, deliverPendingWebhooks, enqueueSignalDeliveries } from "../src/lib/webhooks";
import { generatePilotReport, getPilotMetrics } from "../src/lib/pilots";
import { GET as listProtocols } from "../src/app/api/v1/protocols/route";
import { POST as createWatch } from "../src/app/api/v1/watch/route";
import { POST as runGuard } from "../src/app/api/v1/guard/route";

function apiRequest(url: string, secret: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${secret}`);
  headers.set("content-type", "application/json");
  return new Request(url, { ...init, headers });
}

async function startWebhookReceiver(secret: string) {
  let received = 0;
  const seen = new Set<string>();
  const server = http.createServer((request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const timestamp = String(request.headers["x-marketlint-timestamp"] ?? "");
      const signature = String(request.headers["x-marketlint-signature"] ?? "");
      const idempotencyKey = String(request.headers["idempotency-key"] ?? "");
      const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
      const left = Buffer.from(signature);
      const right = Buffer.from(expected);
      const signatureOk = left.length === right.length && crypto.timingSafeEqual(left, right);
      const timestampOk = Number.isFinite(Number(timestamp)) && Math.abs(Date.now() - Number(timestamp)) <= 300_000;
      if (!idempotencyKey || seen.has(idempotencyKey) || !signatureOk || !timestampOk) {
        response.writeHead(401).end("rejected");
        return;
      }
      seen.add(idempotencyKey);
      received += 1;
      response.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/market-lint`,
    received: () => received,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const ingestion = await ingestPolymarket(8);
  assert(ingestion.marketsProcessed > 0, "Polymarket ingestion returned no live markets");
  const market = await prisma.market.findFirst({ where: { protocolName: "Polymarket" }, orderBy: { lastIngestedAt: "desc" } });
  assert(market, "No persisted Polymarket market available for P0 smoke test");

  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({ data: { name: `P0 Org A ${suffix}`, slug: `p0-a-${suffix}` } }),
    prisma.organization.create({ data: { name: `P0 Org B ${suffix}`, slug: `p0-b-${suffix}` } }),
  ]);
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `p0-a-${suffix}@example.test` } }),
    prisma.user.create({ data: { email: `p0-b-${suffix}@example.test` } }),
  ]);
  await Promise.all([
    prisma.organizationMembership.create({ data: { organizationId: orgA.id, userId: userA.id, role: "OWNER" } }),
    prisma.organizationMembership.create({ data: { organizationId: orgB.id, userId: userB.id, role: "VIEWER" } }),
  ]);
  const [protocolA, protocolB] = await Promise.all([
    prisma.protocol.create({ data: { organizationId: orgA.id, name: "Polymarket", status: "LIVE_TEST", sourceName: "polymarket-gamma" } }),
    prisma.protocol.create({ data: { organizationId: orgB.id, name: "Private B", status: "SANDBOX" } }),
  ]);
  const [keyA, keyB] = await Promise.all([
    createApiKey({ organizationId: orgA.id, protocolId: protocolA.id, permissions: ["*"], label: "P0 A" }),
    createApiKey({ organizationId: orgB.id, protocolId: protocolB.id, permissions: ["*"], label: "P0 B" }),
  ]);
  assert.notEqual(keyA.key.hash, keyA.secret, "Raw API key was stored instead of a hash");

  const contextA = await requireAccess(apiRequest("http://localhost/access", keyA.secret), { permission: "protocols:read" });
  assert.equal(contextA.organizationId, orgA.id);
  await assert.rejects(
    requireAccess(new Request("http://localhost/access", { headers: { "x-marketlint-user-id": userB.id, "x-marketlint-organization-id": orgB.id } }), { minimumRole: "ADMIN" }),
    /ADMIN role or higher required/,
  );

  const protocolsAResponse = await listProtocols(apiRequest("http://localhost/api/v1/protocols", keyA.secret));
  assert.equal(protocolsAResponse.status, 200);
  const protocolsA = await protocolsAResponse.json() as { data: Array<{ id: string; organizationId: string }> };
  assert(protocolsA.data.some((item) => item.id === protocolA.id));
  assert(protocolsA.data.every((item) => item.organizationId === orgA.id));
  assert(!protocolsA.data.some((item) => item.id === protocolB.id), "Org A could read Org B protocol");

  const watchResponse = await createWatch(apiRequest("http://localhost/api/v1/watch", keyA.secret, {
    method: "POST",
    body: JSON.stringify({ marketId: market.id, protocolId: protocolA.id }),
  }));
  assert.equal(watchResponse.status, 201);
  const watchPayload = await watchResponse.json() as { data: { id: string; organizationId: string } };
  assert.equal(watchPayload.data.organizationId, orgA.id);

  const crossTenantWatch = await createWatch(apiRequest("http://localhost/api/v1/watch", keyA.secret, {
    method: "POST",
    body: JSON.stringify({ marketId: market.id, protocolId: protocolB.id }),
  }));
  assert.equal(crossTenantWatch.status, 404, "Org A was able to bind an Org B protocol");

  const guardResponse = await runGuard(apiRequest("http://localhost/api/v1/guard", keyA.secret, {
    method: "POST",
    body: JSON.stringify({
      title: market.title,
      description: market.description,
      outcomes: market.outcomes,
      resolutionSource: market.resolutionSource ?? "https://polymarket.com",
      marketId: market.id,
    }),
  }));
  assert.equal(guardResponse.status, 200);
  const guardCount = await prisma.guardEvaluation.count({ where: { organizationId: orgA.id, marketId: market.id } });
  assert(guardCount > 0, "Guard evaluation was not persisted");

  await refreshConsensus();
  assert(market.canonicalEventId, "Persisted Polymarket market is missing canonical event");
  const consensus = await prisma.consensusSnapshot.findFirst({ where: { canonicalEventId: market.canonicalEventId }, orderBy: { createdAt: "desc" } });
  assert(consensus, "Consensus snapshot was not persisted");
  assert.equal(consensus.status, "INSUFFICIENT_DATA", "Single-source data was incorrectly presented as cross-protocol consensus");

  const webhookSecret = crypto.randomBytes(24).toString("hex");
  const receiver = await startWebhookReceiver(webhookSecret);
  try {
    const { endpoint } = await createWebhookEndpoint({ organizationId: orgA.id, url: receiver.url, secret: webhookSecret, description: "P0 verified receiver" });
    const signal = await prisma.riskSignal.create({
      data: {
        organizationId: orgA.id,
        watchId: watchPayload.data.id,
        marketId: market.id,
        eventId: market.canonicalEventId,
        type: "P0_SMOKE_SIGNAL",
        severity: "HIGH",
        confidence: 1,
        explanation: "Deterministic P0 webhook delivery smoke signal.",
        evidence: { smoke: true },
        recommendedAction: "REVIEW",
        dedupeKey: `p0-smoke:${suffix}`,
      },
    });
    await enqueueSignalDeliveries({ ...signal, evidence: signal.evidence });
    const delivery = await deliverPendingWebhooks();
    assert(delivery.delivered >= 1, "Signed webhook delivery did not succeed");
    assert.equal(receiver.received(), 1, "Reference receiver did not accept exactly one signed delivery");
    const storedDelivery = await prisma.webhookDelivery.findFirst({ where: { endpointId: endpoint.id, signalId: signal.id } });
    assert.equal(storedDelivery?.status, "DELIVERED");
  } finally {
    await receiver.close();
  }

  const pilot = await prisma.pilot.create({
    data: { organizationId: orgA.id, protocolId: protocolA.id, name: "P0 durable pilot", status: "PILOT_ACTIVE", startedAt: new Date() },
  });
  await prisma.feedback.create({
    data: { organizationId: orgA.id, targetType: "GuardEvaluation", targetId: "p0-smoke", label: "USEFUL", algorithmVersion: "guard-v1" },
  });
  const metrics = await getPilotMetrics(pilot.id, orgA.id);
  assert(metrics, "Pilot metrics were not generated from persisted state");
  const report = await generatePilotReport(pilot.id, orgA.id);
  assert(report?.id && report.html.includes("Market Lint Pilot Report"), "Pilot report was not persisted/generated");

  const connectionString = process.env.DATABASE_URL;
  assert(connectionString, "DATABASE_URL missing during restart persistence check");
  const secondClient = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const afterReconnect = await secondClient.organization.findUnique({ where: { id: orgA.id } });
    assert(afterReconnect, "Persisted organization was not visible to a new Prisma client");
    const afterReconnectWatch = await secondClient.watchRegistration.findUnique({ where: { id: watchPayload.data.id } });
    assert(afterReconnectWatch, "Persisted Watch registration was not visible after reconnect");
    const afterReconnectPilot = await secondClient.pilot.findUnique({ where: { id: pilot.id } });
    assert(afterReconnectPilot, "Persisted Pilot was not visible after reconnect");
  } finally {
    await secondClient.$disconnect();
  }

  console.log(JSON.stringify({
    status: "PASS",
    liveMarketsProcessed: ingestion.marketsProcessed,
    tenantIsolation: "PASS",
    apiKeyHashing: "PASS",
    durableGuard: "PASS",
    durableWatch: "PASS",
    consensusSingleSourceBoundary: "PASS",
    signedWebhookDelivery: "PASS",
    pilotMetricsAndReport: "PASS",
    reconnectPersistence: "PASS",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
