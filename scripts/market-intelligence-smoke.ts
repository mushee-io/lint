import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../src/lib/db";
import { createApiKey } from "../src/lib/auth";
import { ingestPolymarket } from "../src/lib/ingestion";
import { GET as getIntelligence } from "../src/app/api/v1/markets/[id]/intelligence/route";
import { POST as reviewMarket } from "../src/app/api/v1/markets/[id]/review/route";
import { POST as decideMarket } from "../src/app/api/v1/markets/[id]/decision/route";

function decisionRequest(marketId: string, secret: string | null, body: unknown) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  return new Request(`http://localhost/api/v1/markets/${marketId}/decision`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function main() {
  const ingestion = await ingestPolymarket(5);
  assert(ingestion.marketsProcessed > 0, "Polymarket ingestion returned no markets");

  const market = await prisma.market.findFirst({
    where: { protocolName: "Polymarket" },
    orderBy: { lastIngestedAt: "desc" },
  });
  assert(market, "No persisted Polymarket market found");

  const response = await getIntelligence(
    new Request(`http://localhost/api/v1/markets/${market.id}/intelligence`),
    { params: Promise.resolve({ id: market.id }) },
  );
  assert.equal(response.status, 200);

  const payload = await response.json() as {
    data: {
      marketId: string;
      score: number;
      grade: string;
      status: string;
      confidence: number;
      dimensions: Array<{ code: string; score: number; status: string }>;
      algorithmVersion: string;
    };
  };

  assert.equal(payload.data.marketId, market.id);
  assert.equal(payload.data.algorithmVersion, "market-intelligence-v1");
  assert(payload.data.score >= 0 && payload.data.score <= 100, "Market intelligence score is out of bounds");
  assert(payload.data.confidence >= 0 && payload.data.confidence <= 100, "Market intelligence confidence is out of bounds");
  assert.equal(payload.data.dimensions.length, 7);
  for (const required of ["MARKET_STRUCTURE", "RESOLUTION_READINESS", "DATA_INTEGRITY", "LIQUIDITY_SUPPORT", "MARKET_HISTORY", "EVENT_CONTEXT", "CROSS_PROTOCOL_CONSENSUS"]) {
    assert(payload.data.dimensions.some((dimension) => dimension.code === required), `Missing intelligence dimension: ${required}`);
  }

  const missingResponse = await getIntelligence(
    new Request("http://localhost/api/v1/markets/does-not-exist/intelligence"),
    { params: Promise.resolve({ id: "does-not-exist" }) },
  );
  assert.equal(missingResponse.status, 404);

  const unauthenticatedAi = await reviewMarket(
    new Request(`http://localhost/api/v1/markets/${market.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "ai" }),
    }),
    { params: Promise.resolve({ id: market.id }) },
  );
  assert.equal(unauthenticatedAi.status, 401, "Public callers could trigger paid AI review");

  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const organization = await prisma.organization.create({ data: { name: `Intelligence Smoke ${suffix}`, slug: `intelligence-smoke-${suffix}` } });
  try {
    const reviewKey = await createApiKey({ organizationId: organization.id, permissions: ["intelligence:review"], label: "milestone-3-smoke" });
    const decisionKey = await createApiKey({ organizationId: organization.id, permissions: ["operator:decision"], label: "milestone-4-smoke" });

    const reviewResponse = await reviewMarket(
      new Request(`http://localhost/api/v1/markets/${market.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${reviewKey.secret}` },
        body: JSON.stringify({ mode: "deterministic" }),
      }),
      { params: Promise.resolve({ id: market.id }) },
    );
    assert.equal(reviewResponse.status, 200);
    const reviewPayload = await reviewResponse.json() as { data: {
      reviewId: string | null;
      marketId: string;
      verdict: string;
      mode: string;
      providerStatus: string;
      grounding: { policy: string; generatedFrom: string; dimensionCodes: string[] };
    } };
    assert.equal(reviewPayload.data.marketId, market.id);
    assert(["CLEAR", "REVIEW", "HIGH_RISK"].includes(reviewPayload.data.verdict));
    assert.equal(reviewPayload.data.mode, "DETERMINISTIC_FALLBACK");
    assert.equal(reviewPayload.data.providerStatus, "BYPASSED");
    assert.equal(reviewPayload.data.grounding.policy, "AI_EXPLAINS_DETERMINISTIC_INTELLIGENCE");
    assert.equal(reviewPayload.data.grounding.generatedFrom, "PERSISTED_MARKET_INTELLIGENCE");
    assert.equal(reviewPayload.data.grounding.dimensionCodes.length, 7);
    assert(reviewPayload.data.reviewId, "Authenticated review was not persisted");
    const reviewAudit = await prisma.auditLog.findUnique({ where: { id: reviewPayload.data.reviewId! } });
    assert.equal(reviewAudit?.action, "MARKET_AI_REVIEW");

    const unauthenticatedDecision = await decideMarket(
      decisionRequest(market.id, null, { decision: "APPROVE" }),
      { params: Promise.resolve({ id: market.id }) },
    );
    assert.equal(unauthenticatedDecision.status, 401, "Unauthenticated operator decision was accepted");

    const wrongPermissionDecision = await decideMarket(
      decisionRequest(market.id, reviewKey.secret, { decision: "APPROVE" }),
      { params: Promise.resolve({ id: market.id }) },
    );
    assert.equal(wrongPermissionDecision.status, 403, "Review-only key could submit an operator decision");

    const invalidDecision = await decideMarket(
      decisionRequest(market.id, decisionKey.secret, { decision: "SHIP" }),
      { params: Promise.resolve({ id: market.id }) },
    );
    assert.equal(invalidDecision.status, 400, "Invalid operator decision was accepted");

    const approved = await decideMarket(
      decisionRequest(market.id, decisionKey.secret, { decision: "APPROVE", note: "Operator smoke approval" }),
      { params: Promise.resolve({ id: market.id }) },
    );
    assert.equal(approved.status, 200);
    const approvedPayload = await approved.json() as { data: { id: string; decision: string; marketId: string } };
    assert.equal(approvedPayload.data.marketId, market.id);
    assert.equal(approvedPayload.data.decision, "APPROVE");
    const decisionAudit = await prisma.auditLog.findUnique({ where: { id: approvedPayload.data.id } });
    assert.equal(decisionAudit?.organizationId, organization.id);
    assert.equal(decisionAudit?.action, "MARKET_APPROVE");
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
  }

  console.log(JSON.stringify({
    status: "PASS",
    marketId: payload.data.marketId,
    score: payload.data.score,
    grade: payload.data.grade,
    intelligenceStatus: payload.data.status,
    dimensions: payload.data.dimensions.length,
    notFoundBoundary: "PASS",
    paidAiProtection: "PASS",
    groundedReviewerFallback: "PASS",
    durableReviewerAudit: "PASS",
    operatorUnauthenticatedBoundary: "PASS",
    operatorPermissionBoundary: "PASS",
    operatorValidationBoundary: "PASS",
    operatorDecisionPersistence: "PASS",
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
