import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../src/lib/db";
import { createApiKey } from "../src/lib/auth";
import { ingestPolymarket } from "../src/lib/ingestion";
import { POST as decideMarket } from "../src/app/api/v1/markets/[id]/decision/route";

function requestFor(marketId: string, secret: string | null, body: unknown) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  return new Request(`http://localhost/api/v1/markets/${marketId}/decision`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const ingestion = await ingestPolymarket(3);
  assert(ingestion.marketsProcessed > 0, "Polymarket ingestion returned no markets");
  const market = await prisma.market.findFirst({ where: { protocolName: "Polymarket" }, orderBy: { lastIngestedAt: "desc" } });
  assert(market, "No market available for operator workflow smoke");

  const organization = await prisma.organization.create({ data: { name: `Operator Smoke ${suffix}`, slug: `operator-smoke-${suffix}` } });
  const decisionKey = await createApiKey({ organizationId: organization.id, permissions: ["operator:decision"], label: "operator smoke" });
  const wrongKey = await createApiKey({ organizationId: organization.id, permissions: ["intelligence:review"], label: "wrong permission" });
  const params = { params: Promise.resolve({ id: market.id }) };

  const unauthenticated = await decideMarket(requestFor(market.id, null, { decision: "APPROVE" }), params);
  assert.equal(unauthenticated.status, 401, "Unauthenticated operator decision was accepted");

  const forbidden = await decideMarket(requestFor(market.id, wrongKey.secret, { decision: "APPROVE" }), params);
  assert.equal(forbidden.status, 403, "API key without operator:decision was accepted");

  const invalid = await decideMarket(requestFor(market.id, decisionKey.secret, { decision: "SHIP" }), params);
  assert.equal(invalid.status, 400, "Invalid decision value was accepted");

  const approved = await decideMarket(requestFor(market.id, decisionKey.secret, { decision: "APPROVE", note: "Smoke-tested operator approval." }), params);
  assert.equal(approved.status, 200);
  const payload = await approved.json() as { data: { id: string; marketId: string; decision: string; intelligence: { score: number; status: string } } };
  assert.equal(payload.data.marketId, market.id);
  assert.equal(payload.data.decision, "APPROVE");
  assert(payload.data.intelligence.score >= 0 && payload.data.intelligence.score <= 100);

  const audit = await prisma.auditLog.findUnique({ where: { id: payload.data.id } });
  assert(audit, "Operator decision audit record was not persisted");
  assert.equal(audit.organizationId, organization.id);
  assert.equal(audit.resourceId, market.id);
  assert.equal(audit.action, "MARKET_APPROVE");

  console.log(JSON.stringify({
    status: "PASS",
    marketId: market.id,
    unauthenticatedBoundary: "PASS",
    permissionBoundary: "PASS",
    validationBoundary: "PASS",
    persistedDecision: "PASS",
    decision: payload.data.decision,
    intelligenceStatus: payload.data.intelligence.status,
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
