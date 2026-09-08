import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { ingestManifold } from "@/lib/ingestion";

async function main() {
  const result = await ingestManifold(5);
  const persistedMarkets = await prisma.market.count({ where: { protocolName: "Manifold" } });
  const source = await prisma.dataSourceState.findUnique({ where: { source: "manifold-v0" } });
  assert(result.marketsProcessed > 0, "Manifold returned no binary markets");
  assert(persistedMarkets > 0, "Manifold markets were not persisted");
  assert.equal(source?.freshness, "FRESH");
  console.log(JSON.stringify({ ...result, persistedMarkets, sourceFreshness: source?.freshness ?? "UNKNOWN" }, null, 2));
}

main().finally(() => prisma.$disconnect());
