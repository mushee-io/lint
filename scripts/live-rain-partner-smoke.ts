import { POST as validatePartnerMarket } from "../src/app/api/v1/partner/validate/route";

type JsonRecord = Record<string, unknown>;

const endpoints = [
  "https://prod-api.rain.one/pools/public-pools?limit=5",
  "https://prod2-api.rain.one/pools/public-pools?limit=5",
];

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function firstString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toIso(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  return "";
}

function extractPools(body: unknown): JsonRecord[] {
  const root = asRecord(body);
  if (!root) return [];
  const data = asRecord(root.data);
  const candidates = [
    data?.pools,
    data?.markets,
    root.pools,
    root.markets,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map(asRecord).filter((value): value is JsonRecord => Boolean(value));
  }
  return [];
}

async function fetchRainMarket() {
  const failures: string[] = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json", "User-Agent": "Market-Lint-CI/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        failures.push(`${endpoint} -> HTTP ${response.status}`);
        continue;
      }
      const body = await response.json();
      const pools = extractPools(body);
      const market = pools.find((pool) => firstString(pool, ["id", "_id", "contractAddress"]) && firstString(pool, ["title", "question", "marketQuestion"]));
      if (!market) {
        failures.push(`${endpoint} -> no usable public market in response`);
        continue;
      }
      return { endpoint, market };
    } catch (error) {
      failures.push(`${endpoint} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Rain public market fetch failed. ${failures.join(" | ")}`);
}

async function main() {
  const { endpoint, market } = await fetchRainMarket();
  const poolData = asRecord(market.poolData) ?? {};
  const externalId = firstString(market, ["id", "_id", "contractAddress"]);
  const title = firstString(market, ["title", "question", "marketQuestion"]) || firstString(poolData, ["question", "title"]);
  const closeTime =
    toIso(market.endTime) ||
    toIso(market.endDate) ||
    toIso(market.closeTime) ||
    toIso(poolData.endDate) ||
    toIso(poolData.endTime);

  if (!externalId || !title) throw new Error("Rain market did not expose an id/title pair Market Lint can validate.");

  const payload = {
    externalId,
    title,
    description: firstString(market, ["description", "marketDescription"]) || firstString(poolData, ["description"]),
    outcomes: ["YES", "NO"],
    closeTime,
    status: "OPEN",
    volume: Number(market.totalVolume ?? poolData.totalVolumeUSD ?? 0),
    liquidity: Number(market.totalLiquidity ?? poolData.totalLiquidityUSD ?? 0),
  };

  const request = new Request("http://market-lint.local/api/v1/partner/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const response = await validatePartnerMarket(request);
  const result = (await response.json()) as JsonRecord;
  const data = asRecord(result.data);
  const guardPreview = asRecord(data?.guardPreview);

  if (!response.ok) throw new Error(`Market Lint validation returned HTTP ${response.status}: ${JSON.stringify(result)}`);
  if (data?.accepted !== true || data?.mode !== "VALIDATION_ONLY") throw new Error(`Unexpected validation response: ${JSON.stringify(result)}`);
  if (guardPreview?.algorithmVersion !== "guard-v2") throw new Error(`Guard v2 did not run: ${JSON.stringify(result)}`);

  console.log(JSON.stringify({
    ok: true,
    source: endpoint,
    externalId,
    title,
    closeTime: closeTime || null,
    decision: guardPreview.decision,
    marketLintScore: guardPreview.marketLintScore,
    algorithmVersion: guardPreview.algorithmVersion,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
