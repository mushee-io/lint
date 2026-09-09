import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { POST as runGuard } from "../src/app/api/v1/guard/route";

async function main() {
  const response = await runGuard(new Request("http://localhost/api/v1/guard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Will Bitcoin close above $150,000 on December 31, 2026?",
      description: "Resolve YES if the Coinbase BTC-USD spot price is above 150000 USD at the stated cutoff. Resolve NO otherwise, according to the named source. If the source is temporarily unavailable, use its first published price after the cutoff.",
      outcomes: ["YES", "NO"],
      resolutionSource: "https://www.coinbase.com/price/bitcoin",
      closeTime: "2026-12-31T23:59:59Z"
    }),
  }));

  assert.equal(response.status, 200, "Guard endpoint did not preserve its 200 success contract");
  const payload = await response.json() as { data: { id: string; decision: string; marketLintScore: number; checks: Array<{ code: string }>; suggestions: string[]; algorithmVersion: string } };
  assert.equal(payload.data.algorithmVersion, "guard-v2");
  assert.equal(payload.data.decision, "ALLOW");
  assert(payload.data.marketLintScore >= 82, "Strong market did not clear the listing threshold");
  assert.equal(payload.data.checks.length, 7);
  assert(payload.data.checks.some((check) => check.code === "RESOLUTION_SOURCE"));
  assert(payload.data.checks.some((check) => check.code === "DUPLICATE_MARKET"));

  const persisted = await prisma.guardEvaluation.findUnique({ where: { id: payload.data.id } });
  assert(persisted, "Guard evaluation was not persisted");
  assert.equal(persisted.algorithmVersion, "guard-v2");

  console.log(JSON.stringify({
    status: "PASS",
    decision: payload.data.decision,
    marketLintScore: payload.data.marketLintScore,
    checks: payload.data.checks.map((check) => check.code),
    persisted: true,
    algorithmVersion: payload.data.algorithmVersion,
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
