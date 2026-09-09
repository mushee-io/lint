import "dotenv/config";
import { ingestKalshi } from "../src/lib/ingestion";
import { prisma } from "../src/lib/db";

async function main() {
  const result = await ingestKalshi(5);
  const persisted = await prisma.market.count({ where: { protocolName: "Kalshi" } });
  const source = await prisma.dataSourceState.findUnique({ where: { source: "kalshi-public-rest" } });
  if (result.marketsProcessed < 1 || persisted < 1 || !source?.lastSuccessAt) throw new Error("Live Kalshi persistence smoke test did not persist real markets");
  console.log(JSON.stringify({ ...result, persistedMarkets: persisted, sourceFreshness: source.freshness }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
