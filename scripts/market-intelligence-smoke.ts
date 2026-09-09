import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { ingestPolymarket } from "../src/lib/ingestion";
import { GET as getIntelligence } from "../src/app/api/v1/markets/[id]/intelligence/route";

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

  console.log(JSON.stringify({
    status: "PASS",
    marketId: payload.data.marketId,
    score: payload.data.score,
    grade: payload.data.grade,
    intelligenceStatus: payload.data.status,
    dimensions: payload.data.dimensions.length,
    notFoundBoundary: "PASS",
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
