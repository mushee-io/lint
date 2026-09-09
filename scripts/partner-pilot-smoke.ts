import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../src/lib/db";
import { POST as activatePilot } from "../src/app/api/v1/pilots/[id]/activate/route";
import { POST as ingestPartnerFeed } from "../src/app/api/v1/partner/markets/route";
import { POST as guardMarket } from "../src/app/api/v1/guard/route";
import { POST as createWebhook } from "../src/app/api/v1/webhooks/route";
import { POST as submitFeedback } from "../src/app/api/v1/feedback/route";
import { POST as actOnIncident } from "../src/app/api/v1/incidents/[id]/route";
import { GET as getPilotStatus } from "../src/app/api/v1/pilots/[id]/status/route";
import { GET as getPilotReport } from "../src/app/api/v1/pilots/[id]/report/route";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Partner pilot smoke must not run against production");
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const user = await prisma.user.create({ data: { email: `pilot-${suffix}@example.com` } });
  const organization = await prisma.organization.create({ data: { name: `Pilot ${suffix}`, slug: `pilot-${suffix}` } });
  await prisma.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  const protocol = await prisma.protocol.create({ data: { organizationId: organization.id, name: `Partner-${suffix}`, sourceName: `partner-${suffix}`, status: "SANDBOX" } });
  const pilot = await prisma.pilot.create({ data: { organizationId: organization.id, protocolId: protocol.id, name: `Partner pilot ${suffix}`, status: "LIVE_TEST" } });
  const userHeaders = { "x-marketlint-user-id": user.id, "x-marketlint-organization-id": organization.id };
  const canonicalIds = new Set<string>();

  try {
    const activateResponse = await activatePilot(new Request(`http://localhost/api/v1/pilots/${pilot.id}/activate`, { method: "POST", headers: userHeaders }), { params: Promise.resolve({ id: pilot.id }) });
    assert.equal(activateResponse.status, 200);
    const activation = await activateResponse.json() as { data: { liveKey: { secret?: string; created: boolean; prefix: string }; pilot: { status: string } } };
    assert.equal(activation.data.pilot.status, "PILOT_ACTIVE");
    assert.equal(activation.data.liveKey.created, true);
    assert(activation.data.liveKey.secret);
    const apiKey = activation.data.liveKey.secret!;
    const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };

    const webhookResponse = await createWebhook(new Request("http://localhost/api/v1/webhooks", {
      method: "POST",
      headers,
      body: JSON.stringify({ url: "http://127.0.0.1:39999/market-lint-pilot", description: "partner smoke webhook" }),
    }));
    assert.equal(webhookResponse.status, 201);

    const externalId = `partner-market-${suffix}`;
    const feedResponse = await ingestPartnerFeed(new Request("http://localhost/api/v1/partner/markets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        autoWatch: true,
        markets: [{
          externalId,
          title: `Will the partner pilot ${suffix} reach its test milestone by December 31, 2026?`,
          description: "Resolves YES if the test milestone is achieved by the stated UTC deadline.",
          outcomes: ["YES", "NO"],
          probability: 0.61,
          liquidity: 25000,
          volume: 5000,
          resolutionSource: "https://example.com/pilot-resolution",
          closeTime: "2026-12-31T23:59:59Z",
          status: "OPEN",
          updatedAt: new Date().toISOString(),
        }],
      }),
    }));
    assert.equal(feedResponse.status, 201);
    const feed = await feedResponse.json() as { data: { marketsProcessed: number; watchesActivated: number; marketIds: Array<{ id: string; externalId: string }> } };
    assert.equal(feed.data.marketsProcessed, 1);
    assert.equal(feed.data.watchesActivated, 1);
    const marketId = feed.data.marketIds[0]?.id;
    assert(marketId);
    const storedMarket = await prisma.market.findUnique({ where: { id: marketId } });
    assert(storedMarket?.canonicalEventId);
    canonicalIds.add(storedMarket!.canonicalEventId!);

    const guardResponse = await guardMarket(new Request("http://localhost/api/v1/guard", {
      method: "POST",
      headers,
      body: JSON.stringify({
        marketId,
        title: storedMarket!.title,
        description: storedMarket!.description,
        outcomes: ["YES", "NO"],
        closeTime: "2026-12-31T23:59:59Z",
        resolutionSource: "https://example.com/pilot-resolution",
      }),
    }));
    assert.equal(guardResponse.status, 200);
    const guard = await guardResponse.json() as { data: { id: string; decision: string; responseTimeMs: number } };
    assert(["ALLOW", "REVIEW", "BLOCK"].includes(guard.data.decision));
    assert(guard.data.responseTimeMs >= 0);

    const feedbackResponse = await submitFeedback(new Request("http://localhost/api/v1/feedback", {
      method: "POST",
      headers,
      body: JSON.stringify({ targetType: "GuardEvaluation", targetId: guard.data.id, label: "FALSE_POSITIVE", comment: "Synthetic partner feedback for pilot measurement." }),
    }));
    assert.equal(feedbackResponse.status, 201);

    const watch = await prisma.watchRegistration.findUnique({ where: { organizationId_marketId: { organizationId: organization.id, marketId } } });
    assert(watch?.active);
    const signal = await prisma.riskSignal.create({
      data: {
        organizationId: organization.id,
        watchId: watch!.id,
        marketId,
        eventId: storedMarket!.canonicalEventId,
        type: "PARTNER_PILOT_TEST",
        severity: "HIGH",
        confidence: 0.9,
        explanation: "Synthetic CI incident used to verify response-time measurement.",
        evidence: { source: "partner-pilot-smoke" },
        recommendedAction: "ACKNOWLEDGE_TEST_INCIDENT",
        algorithmVersion: "partner-pilot-smoke-v1",
        dedupeKey: `partner-pilot-smoke:${suffix}`,
        detectedAt: new Date(Date.now() - 1500),
      },
    });
    const incidentResponse = await actOnIncident(new Request(`http://localhost/api/v1/incidents/${signal.id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "ACKNOWLEDGE", note: "CI acknowledgement" }),
    }), { params: Promise.resolve({ id: signal.id }) });
    assert.equal(incidentResponse.status, 200);
    const incident = await incidentResponse.json() as { data: { responseTimeMs: number } };
    assert(incident.data.responseTimeMs >= 1000);

    const statusResponse = await getPilotStatus(new Request(`http://localhost/api/v1/pilots/${pilot.id}/status`, { headers }), { params: Promise.resolve({ id: pilot.id }) });
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json() as { data: { readyForMeasuredPilot: boolean; checklist: Array<{ key: string; pass: boolean }> } };
    assert.equal(status.data.readyForMeasuredPilot, true);
    assert(status.data.checklist.some((item) => item.key === "PARTNER_FEED" && item.pass));
    assert(status.data.checklist.some((item) => item.key === "WEBHOOK" && item.pass));

    const reportResponse = await getPilotReport(new Request(`http://localhost/api/v1/pilots/${pilot.id}/report?generate=1`, { headers }), { params: Promise.resolve({ id: pilot.id }) });
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json() as { data: { metrics: { partnerMarketsIngested: number; feedback: { falsePositives: number }; responseTimesMs: { guardAverage: number | null; acknowledgeAverage: number | null } }; impactSummary: { guardInterventions: number } } };
    assert(report.data.metrics.partnerMarketsIngested >= 1);
    assert.equal(report.data.metrics.feedback.falsePositives, 1);
    assert(report.data.metrics.responseTimesMs.guardAverage != null);
    assert(report.data.metrics.responseTimesMs.acknowledgeAverage != null);

    console.log(JSON.stringify({
      status: "PASS",
      pilotActivation: "PASS",
      livePartnerKey: "PASS",
      partnerFeed: "PASS",
      autoWatch: "PASS",
      guardMeasurement: "PASS",
      webhookConfiguration: "PASS",
      partnerFeedback: "PASS",
      incidentResponseMeasurement: "PASS",
      measuredPilotReadiness: "PASS",
      impactReport: "PASS",
    }, null, 2));
  } finally {
    const markets = await prisma.market.findMany({ where: { protocolName: protocol.name }, select: { id: true, canonicalEventId: true } }).catch(() => []);
    markets.forEach((market) => { if (market.canonicalEventId) canonicalIds.add(market.canonicalEventId); });
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.market.deleteMany({ where: { protocolName: protocol.name } }).catch(() => undefined);
    await prisma.dataSourceState.deleteMany({ where: { source: `partner-${protocol.id}` } }).catch(() => undefined);
    for (const eventId of canonicalIds) {
      const remaining = await prisma.market.count({ where: { canonicalEventId: eventId } }).catch(() => 1);
      if (remaining === 0) await prisma.canonicalEvent.delete({ where: { id: eventId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
