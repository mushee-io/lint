import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createApiKey } from "../src/lib/auth";
import { prisma } from "../src/lib/db";
import { listIncidents } from "../src/lib/incidents";
import { recordWatchBaseline, refreshWatchEngine } from "../src/lib/watch-engine";
import { GET as getIncidents } from "../src/app/api/v1/incidents/route";
import { POST as actOnIncident } from "../src/app/api/v1/incidents/[id]/route";

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const organization = await prisma.organization.create({ data: { name: `Watch V2 ${suffix}`, slug: `watch-v2-${suffix}` } });
  const protocol = await prisma.protocol.create({ data: { organizationId: organization.id, name: `Synthetic ${suffix}`, status: "LIVE_TEST", sourceName: `watch-smoke-${suffix}` } });
  const market = await prisma.market.create({
    data: {
      externalId: `watch-market-${suffix}`,
      protocolName: `Synthetic-${suffix}`,
      title: "Will synthetic Watch event resolve YES?",
      description: "Deterministic Watch v2 smoke market.",
      outcomes: ["YES", "NO"],
      status: "OPEN",
      prices: [0.70, 0.30],
      liquidity: 300,
      volume: 600,
      resolutionSource: "https://new.example/resolve",
      freshness: "FRESH",
      lastIngestedAt: new Date(),
    },
  });
  const watch = await prisma.watchRegistration.create({ data: { organizationId: organization.id, protocolId: protocol.id, marketId: market.id } });

  const probabilities = [0.30, 0.31, 0.32, 0.33, 0.34, 0.70];
  const liquidities = [1000, 980, 960, 940, 900, 300];
  const volumes = [100, 120, 140, 160, 180, 600];
  const base = Date.now() - probabilities.length * 60_000;
  for (let index = 0; index < probabilities.length; index += 1) {
    await prisma.marketSnapshot.create({
      data: {
        marketId: market.id,
        timestamp: new Date(base + index * 60_000),
        probability: probabilities[index],
        liquidity: liquidities[index],
        volume: volumes[index],
        freshness: "FRESH",
      },
    });
  }

  await prisma.dataSourceState.create({
    data: {
      source: protocol.sourceName!,
      freshness: "AGING",
      lastAttemptAt: new Date(),
      lastSuccessAt: new Date(Date.now() - 15 * 60_000),
      lastError: "synthetic upstream timeout",
      consecutiveFailures: 3,
    },
  });
  await recordWatchBaseline({ organizationId: organization.id, watchId: watch.id, marketId: market.id, resolutionSource: "https://old.example/resolve", marketStatus: "OPEN" });

  try {
    const first = await refreshWatchEngine({ organizationId: organization.id });
    assert(first.signalsCreated >= 5, `Expected multiple Watch v2 signals, got ${first.signalsCreated}`);
    const signals = await prisma.riskSignal.findMany({ where: { organizationId: organization.id, marketId: market.id } });
    const types = new Set(signals.map((signal) => signal.type));
    for (const expected of ["PROBABILITY_SHOCK", "PROBABILITY_REGIME_SHIFT", "LIQUIDITY_DRAWDOWN", "LIQUIDITY_REGIME_CHANGE", "VOLUME_ACCELERATION", "SOURCE_FAILURE", "RESOLUTION_SOURCE_CHANGED"]) {
      assert(types.has(expected), `Missing Watch v2 signal: ${expected}`);
    }
    assert(signals.every((signal) => signal.algorithmVersion === "watch-v2"));

    const second = await refreshWatchEngine({ organizationId: organization.id });
    assert.equal(second.signalsCreated, 0, "Watch v2 emitted duplicate incidents for unchanged persisted evidence");

    const key = await createApiKey({ organizationId: organization.id, permissions: ["incidents:read", "incidents:write"], label: "watch-v2-smoke" });
    const request = new Request("http://localhost/api/v1/incidents", { headers: { authorization: `Bearer ${key.secret}` } });
    const response = await getIncidents(request);
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: Array<{ id: string; status: string; type: string }> };
    assert(payload.data.length >= 5);
    const incident = payload.data.find((item) => item.type === "PROBABILITY_SHOCK");
    assert(incident);
    assert.equal(incident.status, "OPEN");

    const acknowledge = await actOnIncident(new Request(`http://localhost/api/v1/incidents/${incident.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "ACKNOWLEDGE", note: "Investigating synthetic probability shock" }),
    }), { params: Promise.resolve({ id: incident.id }) });
    assert.equal(acknowledge.status, 200);
    let listed = await listIncidents(organization.id, { limit: 100 });
    assert.equal(listed.find((item) => item.id === incident.id)?.status, "ACKNOWLEDGED");

    const resolve = await actOnIncident(new Request(`http://localhost/api/v1/incidents/${incident.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "RESOLVE", note: "Synthetic incident verified" }),
    }), { params: Promise.resolve({ id: incident.id }) });
    assert.equal(resolve.status, 200);
    listed = await listIncidents(organization.id, { limit: 100 });
    assert.equal(listed.find((item) => item.id === incident.id)?.status, "RESOLVED");

    console.log(JSON.stringify({
      status: "PASS",
      algorithmVersion: first.algorithmVersion,
      signalsCreated: first.signalsCreated,
      signalTypes: [...types].sort(),
      deduplication: "PASS",
      incidentRead: "PASS",
      incidentAcknowledge: "PASS",
      incidentResolve: "PASS",
    }, null, 2));
  } finally {
    await prisma.riskSignal.deleteMany({ where: { marketId: market.id } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ organizationId: organization.id }, { resourceId: watch.id }] } });
    await prisma.watchRegistration.deleteMany({ where: { id: watch.id } });
    await prisma.dataSourceState.deleteMany({ where: { source: protocol.sourceName! } });
    await prisma.protocol.delete({ where: { id: protocol.id } });
    await prisma.apiKey.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.marketSnapshot.deleteMany({ where: { marketId: market.id } });
    await prisma.market.delete({ where: { id: market.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
