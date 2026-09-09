import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../src/lib/db";
import { createApiKey } from "../src/lib/auth";
import { ingestPolymarket } from "../src/lib/ingestion";
import { POST as reviewMarket } from "../src/app/api/v1/markets/[id]/review/route";

function request(url: string, secret?: string, body: Record<string, unknown> = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const ingestion = await ingestPolymarket(3);
  assert(ingestion.marketsProcessed > 0, "AI reviewer smoke requires at least one persisted market");
  const market = await prisma.market.findFirst({ where: { protocolName: "Polymarket" }, orderBy: { lastIngestedAt: "desc" } });
  assert(market, "No persisted market available for AI reviewer smoke");

  const unauthenticatedAi = await reviewMarket(
    request(`http://localhost/api/v1/markets/${market.id}/review`, undefined, { mode: "ai" }),
    { params: Promise.resolve({ id: market.id }) },
  );
  assert.equal(unauthenticatedAi.status, 401, "Unauthenticated callers could trigger paid AI review");

  const organization = await prisma.organization.create({ data: { name: `AI Reviewer ${suffix}`, slug: `ai-reviewer-${suffix}` } });
  try {
    const apiKey = await createApiKey({ organizationId: organization.id, permissions: ["intelligence:review"], label: "AI reviewer smoke" });
    const response = await reviewMarket(
      request(`http://localhost/api/v1/markets/${market.id}/review`, apiKey.secret, { mode: "deterministic" }),
      { params: Promise.resolve({ id: market.id }) },
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: {
      reviewId: string | null;
      marketId: string;
      verdict: string;
      confidence: number;
      mode: string;
      providerStatus: string;
      findings: Array<{ code: string; explanation: string }>;
      grounding: { policy: string; generatedFrom: string; dimensionCodes: string[] };
    } };

    assert.equal(payload.data.marketId, market.id);
    assert(["CLEAR", "REVIEW", "HIGH_RISK"].includes(payload.data.verdict));
    assert(payload.data.confidence >= 0 && payload.data.confidence <= 100);
    assert.equal(payload.data.mode, "DETERMINISTIC_FALLBACK");
    assert.equal(payload.data.providerStatus, "BYPASSED");
    assert.equal(payload.data.grounding.policy, "AI_EXPLAINS_DETERMINISTIC_INTELLIGENCE");
    assert.equal(payload.data.grounding.generatedFrom, "PERSISTED_MARKET_INTELLIGENCE");
    assert(payload.data.grounding.dimensionCodes.length >= 7);
    assert(payload.data.reviewId, "Authenticated review was not persisted to the audit log");

    const audit = await prisma.auditLog.findUnique({ where: { id: payload.data.reviewId! } });
    assert(audit, "Persisted AI review audit record not found");
    assert.equal(audit.action, "MARKET_AI_REVIEW");
    assert.equal(audit.resourceId, market.id);

    console.log(JSON.stringify({
      status: "PASS",
      marketId: market.id,
      verdict: payload.data.verdict,
      providerStatus: payload.data.providerStatus,
      paidAiProtected: "PASS",
      groundedDeterministicFallback: "PASS",
      durableReviewAudit: "PASS",
    }, null, 2));
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
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
